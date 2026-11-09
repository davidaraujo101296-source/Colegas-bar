-- Abre conta da mesa (ou devolve a que já está aberta) ou conta com nome.
create or replace function public.abrir_conta(p_mesa integer default null, p_nome text default null)
returns bigint language plpgsql set search_path = '' as $$
declare v_id bigint; v_nome text := nullif(btrim(coalesce(p_nome, '')), '');
begin
  perform public.exigir_admin();
  if p_mesa is null and v_nome is null then raise exception 'Escolha uma mesa ou digite um nome.'; end if;
  if p_mesa is not null then
    select id into v_id from public.contas where mesa = p_mesa and status = 'aberta';
    if v_id is not null then return v_id; end if;
  end if;
  insert into public.contas (mesa, nome) values (p_mesa, v_nome) returning id into v_id;
  return v_id;
end $$;

-- Lança produto na conta. Se já tem o mesmo produto com o mesmo preço, soma a quantidade.
create or replace function public.lancar_item(p_conta bigint, p_produto bigint, p_qtd integer default 1)
returns void language plpgsql set search_path = '' as $$
declare v_prod public.produtos; v_item bigint;
begin
  perform public.exigir_admin();
  if not exists (select 1 from public.contas where id = p_conta and status = 'aberta') then
    raise exception 'Essa conta já foi fechada.';
  end if;
  select * into v_prod from public.produtos where id = p_produto;
  if v_prod.id is null then raise exception 'Produto não encontrado.'; end if;
  if p_qtd is null or p_qtd < 1 or p_qtd > 999 then raise exception 'Quantidade inválida.'; end if;
  select id into v_item from public.itens_conta
    where conta_id = p_conta and produto_id = p_produto and preco = v_prod.preco
    order by id desc limit 1;
  if v_item is not null then
    update public.itens_conta set quantidade = quantidade + p_qtd, nome = v_prod.nome where id = v_item;
  else
    insert into public.itens_conta (conta_id, produto_id, nome, preco, quantidade)
    values (p_conta, p_produto, v_prod.nome, v_prod.preco, p_qtd);
  end if;
end $$;

-- Muda a quantidade de um item. Zero tira o item da conta.
create or replace function public.mudar_quantidade(p_item bigint, p_qtd integer)
returns void language plpgsql set search_path = '' as $$
declare v_conta bigint;
begin
  perform public.exigir_admin();
  select i.conta_id into v_conta from public.itens_conta i join public.contas c on c.id = i.conta_id
    where i.id = p_item and c.status = 'aberta';
  if v_conta is null then raise exception 'Item não encontrado ou conta já fechada.'; end if;
  if p_qtd is null or p_qtd < 0 or p_qtd > 999 then raise exception 'Quantidade inválida.'; end if;
  if p_qtd = 0 then delete from public.itens_conta where id = p_item;
  else update public.itens_conta set quantidade = p_qtd where id = p_item;
  end if;
end $$;

-- Edita produto. O novo nome/preço vale também para o que já está lançado em contas ABERTAS.
-- Contas fechadas e fiados já anotados ficam como estavam.
create or replace function public.editar_produto(p_id bigint, p_nome text, p_preco integer, p_categoria text)
returns public.produtos language plpgsql set search_path = '' as $$
declare v_prod public.produtos;
begin
  perform public.exigir_admin();
  update public.produtos set nome = btrim(p_nome), preco = p_preco, categoria = p_categoria
    where id = p_id returning * into v_prod;
  if v_prod.id is null then raise exception 'Produto não encontrado.'; end if;
  update public.itens_conta i set nome = v_prod.nome, preco = v_prod.preco
    from public.contas c
    where c.id = i.conta_id and c.status = 'aberta' and i.produto_id = p_id;
  return v_prod;
end $$;

-- Fecha a conta. No fiado, cada produto vai para o caderninho do cliente.
create or replace function public.fechar_conta(p_conta bigint, p_forma text, p_cliente bigint default null)
returns integer language plpgsql set search_path = '' as $$
declare v_total integer;
begin
  perform public.exigir_admin();
  perform 1 from public.contas where id = p_conta and status = 'aberta' for update;
  if not found then raise exception 'Essa conta já foi fechada.'; end if;
  if p_forma not in ('dinheiro', 'pix', 'cartao', 'fiado') then raise exception 'Escolha como pagou.'; end if;
  select coalesce(sum(quantidade * preco), 0) into v_total from public.itens_conta where conta_id = p_conta;
  if not exists (select 1 from public.itens_conta where conta_id = p_conta) then
    raise exception 'A conta está vazia.';
  end if;
  if p_forma = 'fiado' then
    if p_cliente is null or not exists (select 1 from public.clientes where id = p_cliente and ativo) then
      raise exception 'Escolha quem vai ficar devendo.';
    end if;
    insert into public.fiado (cliente_id, tipo, produto_id, descricao, quantidade, valor, conta_id)
    select p_cliente, 'compra', produto_id, nome, quantidade, quantidade * preco, p_conta
    from public.itens_conta where conta_id = p_conta and quantidade * preco > 0 order by id;
  end if;
  update public.contas
    set status = 'paga', forma = p_forma, cliente_id = case when p_forma = 'fiado' then p_cliente end,
        total = v_total, fechada_em = now()
    where id = p_conta;
  return v_total;
end $$;

create or replace function public.cancelar_conta(p_conta bigint)
returns void language plpgsql set search_path = '' as $$
begin
  perform public.exigir_admin();
  update public.contas set status = 'cancelada', fechada_em = now(),
    total = (select coalesce(sum(quantidade * preco), 0) from public.itens_conta where conta_id = p_conta)
  where id = p_conta and status = 'aberta';
  if not found then raise exception 'Essa conta já foi fechada.'; end if;
end $$;

-- Fiado lançado direto no caderninho do cliente.
create or replace function public.lancar_fiado(p_cliente bigint, p_produto bigint, p_qtd integer default 1)
returns void language plpgsql set search_path = '' as $$
declare v_prod public.produtos;
begin
  perform public.exigir_admin();
  if not exists (select 1 from public.clientes where id = p_cliente and ativo) then raise exception 'Cliente não encontrado.'; end if;
  select * into v_prod from public.produtos where id = p_produto;
  if v_prod.id is null then raise exception 'Produto não encontrado.'; end if;
  if p_qtd is null or p_qtd < 1 or p_qtd > 999 then raise exception 'Quantidade inválida.'; end if;
  if v_prod.preco = 0 then raise exception 'Esse produto está sem preço.'; end if;
  insert into public.fiado (cliente_id, tipo, produto_id, descricao, quantidade, valor)
  values (p_cliente, 'compra', p_produto, v_prod.nome, p_qtd, v_prod.preco * p_qtd);
end $$;

create or replace function public.receber_fiado(p_cliente bigint, p_valor integer, p_forma text)
returns void language plpgsql set search_path = '' as $$
begin
  perform public.exigir_admin();
  if not exists (select 1 from public.clientes where id = p_cliente and ativo) then raise exception 'Cliente não encontrado.'; end if;
  if p_valor is null or p_valor <= 0 then raise exception 'Digite quanto ele pagou.'; end if;
  if p_forma not in ('dinheiro', 'pix', 'cartao') then raise exception 'Escolha como ele pagou.'; end if;
  insert into public.fiado (cliente_id, tipo, descricao, valor, forma)
  values (p_cliente, 'pagamento', 'Pagamento', p_valor, p_forma);
end $$;

-- Painel de vendas entre duas datas (inclusive), no horário de Brasília.
create or replace function public.painel(p_inicio date, p_fim date)
returns jsonb language plpgsql stable set search_path = '' as $$
declare
  tz constant text := 'America/Sao_Paulo';
  v_ini timestamptz := (p_inicio::timestamp) at time zone tz;
  v_fim timestamptz := ((p_fim + 1)::timestamp) at time zone tz;
  v_dias integer := p_fim - p_inicio + 1;
  v_ant_ini timestamptz := ((p_inicio - v_dias)::timestamp) at time zone tz;
  r jsonb;
begin
  perform public.exigir_admin();
  if p_fim < p_inicio or v_dias > 400 then raise exception 'Período inválido.'; end if;

  with
  contas_p as (select * from public.contas where status = 'paga' and fechada_em >= v_ini and fechada_em < v_fim),
  fiado_p as (select * from public.fiado where criado_em >= v_ini and criado_em < v_fim),
  vendas_dia as (
    select (fechada_em at time zone tz)::date as dia, total as valor from contas_p where forma <> 'fiado'
    union all
    select (criado_em at time zone tz)::date, valor from fiado_p where tipo = 'compra'
  ),
  dias as (select d::date as dia from generate_series(p_inicio, p_fim, interval '1 day') d),
  itens as (
    select i.nome, i.quantidade, i.quantidade * i.preco as valor
      from public.itens_conta i join contas_p c on c.id = i.conta_id
    union all
    select descricao, quantidade, valor from fiado_p where tipo = 'compra' and conta_id is null
  ),
  anterior as (
    select coalesce((select sum(total) from public.contas where status = 'paga' and forma <> 'fiado' and fechada_em >= v_ant_ini and fechada_em < v_ini), 0)
         + coalesce((select sum(valor) from public.fiado where tipo = 'compra' and criado_em >= v_ant_ini and criado_em < v_ini), 0) as v
  )
  select jsonb_build_object(
    'na_hora', coalesce((select sum(total) from contas_p where forma <> 'fiado'), 0),
    'fiado_vendido', coalesce((select sum(valor) from fiado_p where tipo = 'compra'), 0),
    'fiado_recebido', coalesce((select sum(valor) from fiado_p where tipo = 'pagamento'), 0),
    'contas_fechadas', (select count(*) from contas_p),
    'gasto_medio', coalesce((select round(avg(total)) from contas_p), 0),
    'anterior', (select v from anterior),
    'por_forma', jsonb_build_object(
      'dinheiro', coalesce((select sum(total) from contas_p where forma = 'dinheiro'), 0),
      'pix', coalesce((select sum(total) from contas_p where forma = 'pix'), 0),
      'cartao', coalesce((select sum(total) from contas_p where forma = 'cartao'), 0)),
    'por_dia', (select jsonb_agg(jsonb_build_object('dia', d.dia, 'valor', coalesce((select sum(valor) from vendas_dia v where v.dia = d.dia), 0)) order by d.dia) from dias d),
    'mais_vendidos', coalesce((select jsonb_agg(m) from (
        select nome, sum(quantidade)::integer as quantidade, sum(valor)::integer as valor
        from itens group by nome order by sum(quantidade) desc, sum(valor) desc limit 10) m), '[]'::jsonb),
    'a_receber_total', coalesce((select sum(case f.tipo when 'compra' then f.valor else -f.valor end)
        from public.fiado f join public.clientes c on c.id = f.cliente_id where c.ativo), 0)
  ) into r;
  return r;
end $$;

-- Permissões: só usuários logados chamam as funções (e elas conferem se é a administradora).
do $$
declare f text;
begin
  foreach f in array array[
    'abrir_conta(integer, text)', 'lancar_item(bigint, bigint, integer)', 'mudar_quantidade(bigint, integer)',
    'editar_produto(bigint, text, integer, text)', 'fechar_conta(bigint, text, bigint)', 'cancelar_conta(bigint)',
    'lancar_fiado(bigint, bigint, integer)', 'receber_fiado(bigint, integer, text)', 'painel(date, date)',
    'eh_admin()', 'exigir_admin()'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
