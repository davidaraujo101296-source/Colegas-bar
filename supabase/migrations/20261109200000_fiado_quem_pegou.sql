-- "Quem pegou?": nome (opcional) de quem pegou cada coisa no fiado.
-- Útil para empresas (ex.: obra) em que vários funcionários pegam no nome do patrão.
alter table public.fiado add column if not exists quem text not null default '' check (char_length(quem) <= 40);

-- Lança fiado com "quem pegou" (opcional).
create or replace function public.anotar_fiado(p_cliente bigint, p_produto bigint, p_qtd integer default 1, p_quem text default '')
returns void language plpgsql set search_path = '' as $$
declare v_prod public.produtos;
begin
  perform public.exigir_admin();
  if not exists (select 1 from public.clientes where id = p_cliente and ativo) then raise exception 'Cliente não encontrado.'; end if;
  select * into v_prod from public.produtos where id = p_produto;
  if v_prod.id is null then raise exception 'Produto não encontrado.'; end if;
  if p_qtd is null or p_qtd < 1 or p_qtd > 999 then raise exception 'Quantidade inválida.'; end if;
  if v_prod.preco = 0 then raise exception 'Esse produto está sem preço.'; end if;
  insert into public.fiado (cliente_id, tipo, produto_id, descricao, quantidade, valor, quem)
  values (p_cliente, 'compra', p_produto, v_prod.nome, p_qtd, v_prod.preco * p_qtd, left(btrim(coalesce(p_quem, '')), 40));
end $$;

-- Ao fechar uma conta com nome no fiado, o nome da conta vira o "quem pegou".
create or replace function public.fechar_conta(p_conta bigint, p_forma text, p_cliente bigint default null)
returns integer language plpgsql set search_path = '' as $$
declare v_total integer; v_quem text;
begin
  perform public.exigir_admin();
  select case when mesa is null and nome is distinct from 'Balcão' then left(coalesce(nome, ''), 40) else '' end
    into v_quem from public.contas where id = p_conta and status = 'aberta' for update;
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
    -- Se o nome da conta é o próprio cliente, não precisa repetir.
    if lower(v_quem) = lower((select nome from public.clientes where id = p_cliente)) then v_quem := ''; end if;
    insert into public.fiado (cliente_id, tipo, produto_id, descricao, quantidade, valor, conta_id, quem)
    select p_cliente, 'compra', produto_id, nome, quantidade, quantidade * preco, p_conta, v_quem
    from public.itens_conta where conta_id = p_conta and quantidade * preco > 0 order by id;
  end if;
  update public.contas
    set status = 'paga', forma = p_forma, cliente_id = case when p_forma = 'fiado' then p_cliente end,
        total = v_total, fechada_em = now()
    where id = p_conta;
  return v_total;
end $$;

revoke all on function public.anotar_fiado(bigint, bigint, integer, text) from public, anon;
grant execute on function public.anotar_fiado(bigint, bigint, integer, text) to authenticated;
