-- ============ Corrigir lançamentos: cancelar (sem apagar), restaurar, reabrir, trocar forma ============

alter table public.fiado
  add column if not exists cancelado boolean not null default false,
  add column if not exists cancelado_motivo text not null default '',
  add column if not exists item_id bigint;
alter table public.contas add column if not exists cancelada_em timestamptz;
create index if not exists fiado_conta_ativos on public.fiado (conta_id) where not cancelado;

-- Saldo do cliente ignora lançamentos cancelados.
create or replace view public.clientes_saldo with (security_invoker = true) as
select c.id, c.nome, c.telefone, c.criado_em,
  coalesce(sum(case f.tipo when 'compra' then f.valor else -f.valor end), 0)::integer as saldo,
  max(f.criado_em) as ultimo_movimento,
  max(f.criado_em) filter (where f.tipo = 'pagamento') as ultimo_pagamento
from public.clientes c
left join public.fiado f on f.cliente_id = c.id and not f.cancelado
where c.ativo
group by c.id;

-- Passa os itens de uma conta para o caderninho do cliente (usado ao fechar ou trocar a forma).
create or replace function public._conta_para_fiado(p_conta bigint, p_cliente bigint)
returns void language plpgsql set search_path = '' as $$
declare v_quem text;
begin
  select case when mesa is null and nome is distinct from 'Balcão' then left(coalesce(nome, ''), 40) else '' end
    into v_quem from public.contas where id = p_conta;
  if lower(v_quem) = lower((select nome from public.clientes where id = p_cliente)) then v_quem := ''; end if;
  insert into public.fiado (cliente_id, tipo, produto_id, descricao, quantidade, valor, conta_id, quem, item_id)
  select p_cliente, 'compra', produto_id, nome, quantidade, quantidade * preco, p_conta, coalesce(v_quem, ''), id
  from public.itens_conta where conta_id = p_conta and quantidade * preco > 0 order by id;
end $$;

create or replace function public.fechar_conta(p_conta bigint, p_forma text, p_cliente bigint default null)
returns integer language plpgsql set search_path = '' as $$
declare v_total integer;
begin
  perform public.exigir_admin();
  perform 1 from public.contas where id = p_conta and status = 'aberta' for update;
  if not found then raise exception 'Essa conta já foi fechada.'; end if;
  if p_forma not in ('dinheiro', 'pix', 'cartao', 'fiado') then raise exception 'Escolha como pagou.'; end if;
  if not exists (select 1 from public.itens_conta where conta_id = p_conta) then raise exception 'A conta está vazia.'; end if;
  select coalesce(sum(quantidade * preco), 0) into v_total from public.itens_conta where conta_id = p_conta;
  if p_forma = 'fiado' then
    if p_cliente is null or not exists (select 1 from public.clientes where id = p_cliente and ativo) then
      raise exception 'Escolha quem vai ficar devendo.';
    end if;
    perform public._conta_para_fiado(p_conta, p_cliente);
  end if;
  update public.contas
    set status = 'paga', forma = p_forma, cliente_id = case when p_forma = 'fiado' then p_cliente end,
        total = v_total, fechada_em = now(), cancelada_em = null
    where id = p_conta;
  return v_total;
end $$;

-- Volta uma conta fechada (ou cancelada) a ficar aberta. Se era fiado, os itens saem do caderninho.
create or replace function public.reabrir_conta(p_conta bigint)
returns bigint language plpgsql set search_path = '' as $$
declare c public.contas; v_mesa integer; v_nome text;
begin
  perform public.exigir_admin();
  select * into c from public.contas where id = p_conta for update;
  if c.id is null then raise exception 'Conta não encontrada.'; end if;
  if c.status = 'aberta' then raise exception 'Essa conta já está aberta.'; end if;
  update public.fiado set cancelado = true, cancelado_motivo = 'conta' where conta_id = p_conta and not cancelado;
  v_mesa := c.mesa; v_nome := c.nome;
  if c.mesa is not null and exists (select 1 from public.contas where mesa = c.mesa and status = 'aberta') then
    v_mesa := null; v_nome := 'Mesa ' || c.mesa || ' (reaberta)';
  end if;
  update public.contas set status = 'aberta', mesa = v_mesa, nome = v_nome, forma = null, cliente_id = null,
    total = 0, fechada_em = null, cancelada_em = null
  where id = p_conta;
  return p_conta;
end $$;

-- Troca a forma de pagamento de uma conta já fechada (ex.: era dinheiro, lançou Pix).
create or replace function public.trocar_forma(p_conta bigint, p_forma text, p_cliente bigint default null)
returns void language plpgsql set search_path = '' as $$
declare c public.contas;
begin
  perform public.exigir_admin();
  select * into c from public.contas where id = p_conta for update;
  if c.id is null or c.status <> 'paga' then raise exception 'Só dá para trocar a forma de uma conta fechada.'; end if;
  if p_forma not in ('dinheiro', 'pix', 'cartao', 'fiado') then raise exception 'Escolha como pagou.'; end if;
  if p_forma = 'fiado' and (p_cliente is null or not exists (select 1 from public.clientes where id = p_cliente and ativo)) then
    raise exception 'Escolha quem vai ficar devendo.';
  end if;
  if c.forma = p_forma and c.cliente_id is not distinct from (case when p_forma = 'fiado' then p_cliente end) then return; end if;
  update public.fiado set cancelado = true, cancelado_motivo = 'conta' where conta_id = p_conta and not cancelado;
  if p_forma = 'fiado' then perform public._conta_para_fiado(p_conta, p_cliente); end if;
  update public.contas set forma = p_forma, cliente_id = case when p_forma = 'fiado' then p_cliente end where id = p_conta;
end $$;

-- Cancela uma conta aberta ou fechada (não apaga: vai para "Canceladas" e pode ser restaurada).
create or replace function public.cancelar_conta(p_conta bigint)
returns void language plpgsql set search_path = '' as $$
declare c public.contas;
begin
  perform public.exigir_admin();
  select * into c from public.contas where id = p_conta for update;
  if c.id is null then raise exception 'Conta não encontrada.'; end if;
  if c.status = 'cancelada' then raise exception 'Essa conta já está cancelada.'; end if;
  update public.fiado set cancelado = true, cancelado_motivo = 'conta' where conta_id = p_conta and not cancelado;
  update public.contas set status = 'cancelada', cancelada_em = now(),
    fechada_em = coalesce(fechada_em, now()),
    total = (select coalesce(sum(quantidade * preco), 0) from public.itens_conta where conta_id = p_conta)
  where id = p_conta;
end $$;

-- Desfaz o cancelamento: a conta volta como estava (fechada, ou aberta se foi cancelada aberta).
create or replace function public.restaurar_conta(p_conta bigint)
returns text language plpgsql set search_path = '' as $$
declare c public.contas;
begin
  perform public.exigir_admin();
  select * into c from public.contas where id = p_conta for update;
  if c.id is null or c.status <> 'cancelada' then raise exception 'Essa conta não está cancelada.'; end if;
  if c.forma is null then
    perform public.reabrir_conta(p_conta);
    return 'aberta';
  end if;
  update public.contas set status = 'paga', cancelada_em = null where id = p_conta;
  if c.forma = 'fiado' then
    update public.fiado set cancelado = false, cancelado_motivo = ''
      where conta_id = p_conta and cancelado and cancelado_motivo = 'conta';
  end if;
  return 'paga';
end $$;

-- Apaga (cancela) um lançamento do fiado. Se veio de uma conta: p_modo 'item' tira só ele, 'conta' cancela a conta toda.
create or replace function public.cancelar_lancamento_fiado(p_id bigint, p_modo text default 'item')
returns void language plpgsql set search_path = '' as $$
declare f public.fiado; v_restam integer;
begin
  perform public.exigir_admin();
  select * into f from public.fiado where id = p_id for update;
  if f.id is null or f.cancelado then raise exception 'Lançamento não encontrado.'; end if;
  if f.conta_id is null then
    update public.fiado set cancelado = true, cancelado_motivo = 'avulso' where id = p_id;
  elsif p_modo = 'conta' then
    perform public.cancelar_conta(f.conta_id);
  else
    update public.fiado set cancelado = true, cancelado_motivo = 'item' where id = p_id;
    if f.item_id is not null then
      delete from public.itens_conta where id = f.item_id;
    else
      delete from public.itens_conta where id = (select id from public.itens_conta
        where conta_id = f.conta_id and produto_id is not distinct from f.produto_id and quantidade = f.quantidade order by id limit 1);
    end if;
    select count(*) into v_restam from public.itens_conta where conta_id = f.conta_id;
    update public.contas set total = greatest(total - f.valor, 0),
      status = case when v_restam = 0 then 'cancelada' else status end,
      cancelada_em = case when v_restam = 0 then now() else cancelada_em end
    where id = f.conta_id;
  end if;
end $$;

-- Desfaz o apagar de um lançamento do fiado.
create or replace function public.restaurar_lancamento_fiado(p_id bigint)
returns void language plpgsql set search_path = '' as $$
declare f public.fiado; v_item bigint;
begin
  perform public.exigir_admin();
  select * into f from public.fiado where id = p_id for update;
  if f.id is null or not f.cancelado then raise exception 'Lançamento não encontrado.'; end if;
  if f.cancelado_motivo = 'conta' then
    perform public.restaurar_conta(f.conta_id);
    return;
  end if;
  if f.cancelado_motivo = 'item' then
    insert into public.itens_conta (conta_id, produto_id, nome, preco, quantidade)
    values (f.conta_id, f.produto_id, f.descricao, f.valor / f.quantidade, f.quantidade) returning id into v_item;
    update public.contas set total = total + f.valor, status = case when status = 'cancelada' then 'paga' else status end,
      cancelada_em = null where id = f.conta_id;
    update public.fiado set cancelado = false, cancelado_motivo = '', item_id = v_item where id = p_id;
    return;
  end if;
  update public.fiado set cancelado = false, cancelado_motivo = '' where id = p_id;
end $$;

-- Corrige um lançamento do fiado: quantidade (só os lançados direto no caderninho) e quem pegou.
create or replace function public.corrigir_lancamento_fiado(p_id bigint, p_qtd integer, p_quem text)
returns void language plpgsql set search_path = '' as $$
declare f public.fiado; v_unit integer;
begin
  perform public.exigir_admin();
  select * into f from public.fiado where id = p_id for update;
  if f.id is null or f.cancelado then raise exception 'Lançamento não encontrado.'; end if;
  if f.tipo <> 'compra' then raise exception 'Pagamento não tem o que corrigir. Se foi errado, apague.'; end if;
  if p_qtd is null or p_qtd < 1 or p_qtd > 999 then raise exception 'Quantidade inválida.'; end if;
  if f.conta_id is not null and p_qtd <> f.quantidade then
    raise exception 'Esse fiado veio de uma conta. Para mudar a quantidade, reabra a conta.';
  end if;
  v_unit := f.valor / f.quantidade;
  update public.fiado set quantidade = p_qtd, valor = v_unit * p_qtd, quem = left(btrim(coalesce(p_quem, '')), 40) where id = p_id;
end $$;

-- Lista de lançamentos com filtros (período, tipo e busca).
create or replace function public.lancamentos(p_inicio date, p_fim date, p_tipo text default 'tudo', p_busca text default '', p_limite integer default 300)
returns jsonb language plpgsql stable set search_path = '' as $$
declare
  tz constant text := 'America/Sao_Paulo';
  v_ini timestamptz := (p_inicio::timestamp) at time zone tz;
  v_fim timestamptz := ((p_fim + 1)::timestamp) at time zone tz;
  v_busca text := '%' || lower(btrim(coalesce(p_busca, ''))) || '%';
  r jsonb;
begin
  perform public.exigir_admin();
  if p_fim < p_inicio then raise exception 'Período inválido.'; end if;
  with
  base as (
    select 'conta'::text as tipo, c.id, c.fechada_em as quando,
      case when c.mesa is not null then 'Mesa ' || c.mesa else c.nome end as titulo,
      c.forma, c.status = 'cancelada' as cancelado, cl.nome as cliente, c.total as valor,
      (select string_agg(case when i.quantidade > 1 then i.quantidade || 'x ' else '' end || i.nome, ', ' order by i.id)
         from public.itens_conta i where i.conta_id = c.id) as detalhe,
      ''::text as quem, null::bigint as cliente_id
    from public.contas c left join public.clientes cl on cl.id = c.cliente_id
    where c.status in ('paga', 'cancelada') and c.fechada_em >= v_ini and c.fechada_em < v_fim
    union all
    select case f.tipo when 'compra' then 'fiado' else 'pagamento' end, f.id, f.criado_em,
      cl.nome, f.forma, f.cancelado, cl.nome, f.valor,
      case when f.tipo = 'compra' then (case when f.quantidade > 1 then f.quantidade || 'x ' else '' end) || f.descricao else 'Pagamento do fiado' end,
      f.quem, f.cliente_id
    from public.fiado f join public.clientes cl on cl.id = f.cliente_id
    where f.conta_id is null and f.criado_em >= v_ini and f.criado_em < v_fim
  ),
  filtrado as (
    select * from base b
    where (case p_tipo
        when 'tudo' then true
        when 'canceladas' then b.cancelado
        when 'fiado' then not b.cancelado and ((b.tipo = 'conta' and b.forma = 'fiado') or b.tipo = 'fiado')
        when 'pagamentos' then not b.cancelado and b.tipo = 'pagamento'
        else not b.cancelado and b.forma = p_tipo and b.tipo in ('conta', 'pagamento')
      end)
      and (v_busca = '%%' or lower(coalesce(b.titulo, '') || ' ' || coalesce(b.detalhe, '') || ' ' || coalesce(b.cliente, '') || ' ' || coalesce(b.quem, '')) like v_busca)
  )
  select jsonb_build_object(
    'quantidade', (select count(*) from filtrado),
    'vendas', coalesce((select sum(valor) from filtrado where not cancelado and tipo in ('conta', 'fiado')), 0),
    'recebido_fiado', coalesce((select sum(valor) from filtrado where not cancelado and tipo = 'pagamento'), 0),
    'itens', coalesce((select jsonb_agg(to_jsonb(x) order by x.quando desc) from (select * from filtrado order by quando desc limit p_limite) x), '[]'::jsonb)
  ) into r;
  return r;
end $$;

-- Painel: ignora cancelados e traz por hora, por mês, por produto e maiores devedores.
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
  fiado_p as (select * from public.fiado where not cancelado and criado_em >= v_ini and criado_em < v_fim),
  vendas as (
    select fechada_em at time zone tz as quando, total as valor from contas_p where forma <> 'fiado'
    union all
    select criado_em at time zone tz, valor from fiado_p where tipo = 'compra'
  ),
  dias as (select d::date as dia from generate_series(p_inicio, p_fim, interval '1 day') d),
  meses as (select d::date as mes from generate_series(date_trunc('month', p_inicio), date_trunc('month', p_fim), interval '1 month') d),
  itens as (
    select i.nome, i.quantidade, i.quantidade * i.preco as valor
      from public.itens_conta i join contas_p c on c.id = i.conta_id
    union all
    select descricao, quantidade, valor from fiado_p where tipo = 'compra' and conta_id is null
  ),
  por_produto as (
    select nome, sum(quantidade)::integer as quantidade, sum(valor)::integer as valor
    from itens group by nome order by sum(quantidade) desc, sum(valor) desc
  ),
  devedores as (
    select s.id, s.nome, s.saldo,
      (current_date - (coalesce(s.ultimo_pagamento,
        (select min(f.criado_em) from public.fiado f where f.cliente_id = s.id and not f.cancelado)) at time zone tz)::date) as dias
    from public.clientes_saldo s where s.saldo > 0 order by s.saldo desc limit 10
  ),
  anterior as (
    select coalesce((select sum(total) from public.contas where status = 'paga' and forma <> 'fiado' and fechada_em >= v_ant_ini and fechada_em < v_ini), 0)
         + coalesce((select sum(valor) from public.fiado where not cancelado and tipo = 'compra' and criado_em >= v_ant_ini and criado_em < v_ini), 0) as v
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
    'por_dia', (select jsonb_agg(jsonb_build_object('dia', d.dia, 'valor', coalesce((select sum(valor) from vendas v where v.quando::date = d.dia), 0)) order by d.dia) from dias d),
    'por_mes', (select jsonb_agg(jsonb_build_object('mes', to_char(m.mes, 'YYYY-MM'), 'valor', coalesce((select sum(valor) from vendas v where date_trunc('month', v.quando)::date = m.mes), 0)) order by m.mes) from meses m),
    'por_hora', (select jsonb_agg(jsonb_build_object('hora', h, 'valor', coalesce((select sum(valor) from vendas v where extract(hour from v.quando) = h), 0)) order by h) from generate_series(0, 23) h),
    'por_produto', coalesce((select jsonb_agg(p) from por_produto p), '[]'::jsonb),
    'mais_vendidos', coalesce((select jsonb_agg(p) from (select * from por_produto limit 10) p), '[]'::jsonb),
    'devedores', coalesce((select jsonb_agg(d) from devedores d), '[]'::jsonb),
    'a_receber_total', coalesce((select sum(saldo) from public.clientes_saldo where saldo > 0), 0)
  ) into r;
  return r;
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'reabrir_conta(bigint)', 'trocar_forma(bigint, text, bigint)', 'cancelar_conta(bigint)', 'restaurar_conta(bigint)',
    'cancelar_lancamento_fiado(bigint, text)', 'restaurar_lancamento_fiado(bigint)', 'corrigir_lancamento_fiado(bigint, integer, text)',
    'lancamentos(date, date, text, text, integer)', 'painel(date, date)', 'fechar_conta(bigint, text, bigint)',
    '_conta_para_fiado(bigint, bigint)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
