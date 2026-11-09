-- ============ Colegas Bar: estrutura inicial ============
-- Valores em dinheiro são guardados em CENTAVOS (inteiro) para não ter erro de arredondamento.

create table public.administradores (
  user_id uuid primary key references auth.users(id) on delete cascade
);
alter table public.administradores enable row level security;

create or replace function public.eh_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.administradores where user_id = auth.uid());
$$;

create or replace function public.exigir_admin() returns void
language plpgsql stable set search_path = '' as $$
begin
  if not public.eh_admin() then raise exception 'Acesso negado.' using errcode = '42501'; end if;
end $$;

-- ---------- produtos ----------
create sequence public.produtos_codigo_seq;
create table public.produtos (
  id bigint generated always as identity primary key,
  codigo integer not null unique default nextval('public.produtos_codigo_seq'),
  nome text not null check (char_length(btrim(nome)) between 1 and 80),
  preco integer not null check (preco between 0 and 10000000),
  categoria text not null default 'Outros' check (categoria in ('Bebidas', 'Comidas', 'Doses', 'Outros')),
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);
alter sequence public.produtos_codigo_seq owned by public.produtos.codigo;

-- ---------- clientes do fiado ----------
create table public.clientes (
  id bigint generated always as identity primary key,
  nome text not null check (char_length(btrim(nome)) between 1 and 80),
  telefone text not null default '' check (char_length(telefone) <= 30),
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

-- ---------- contas (mesa ou nome) ----------
create table public.contas (
  id bigint generated always as identity primary key,
  mesa integer check (mesa between 1 and 99),
  nome text check (nome is null or char_length(btrim(nome)) between 1 and 40),
  status text not null default 'aberta' check (status in ('aberta', 'paga', 'cancelada')),
  forma text check (forma in ('dinheiro', 'pix', 'cartao', 'fiado')),
  cliente_id bigint references public.clientes(id),
  total integer not null default 0,
  aberta_em timestamptz not null default now(),
  fechada_em timestamptz,
  check (mesa is not null or nome is not null)
);
create unique index contas_mesa_aberta on public.contas (mesa) where status = 'aberta' and mesa is not null;
create index contas_fechada_em on public.contas (fechada_em) where status = 'paga';
create index contas_cliente on public.contas (cliente_id);

create table public.itens_conta (
  id bigint generated always as identity primary key,
  conta_id bigint not null references public.contas(id) on delete cascade,
  produto_id bigint references public.produtos(id),
  nome text not null,
  preco integer not null check (preco >= 0),
  quantidade integer not null check (quantidade between 1 and 999),
  criado_em timestamptz not null default now()
);
create index itens_conta_conta on public.itens_conta (conta_id);
create index itens_conta_produto on public.itens_conta (produto_id);

-- ---------- caderninho do fiado ----------
create table public.fiado (
  id bigint generated always as identity primary key,
  cliente_id bigint not null references public.clientes(id),
  tipo text not null check (tipo in ('compra', 'pagamento')),
  produto_id bigint references public.produtos(id),
  descricao text not null default '',
  quantidade integer not null default 1 check (quantidade between 1 and 999),
  valor integer not null check (valor > 0),
  forma text check (forma in ('dinheiro', 'pix', 'cartao')),
  conta_id bigint references public.contas(id),
  criado_em timestamptz not null default now()
);
create index fiado_cliente on public.fiado (cliente_id, criado_em);
create index fiado_criado on public.fiado (criado_em);
create index fiado_produto on public.fiado (produto_id);
create index fiado_conta on public.fiado (conta_id);

-- ---------- segurança: só a administradora acessa ----------
do $$
declare t text;
begin
  foreach t in array array['produtos', 'clientes', 'contas', 'itens_conta', 'fiado'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "somente admin" on public.%I for all to authenticated using ((select public.eh_admin())) with check ((select public.eh_admin()))', t);
  end loop;
end $$;

-- ---------- visões ----------
create view public.clientes_saldo with (security_invoker = true) as
select c.id, c.nome, c.telefone, c.criado_em,
  coalesce(sum(case f.tipo when 'compra' then f.valor else -f.valor end), 0)::integer as saldo,
  max(f.criado_em) as ultimo_movimento,
  max(f.criado_em) filter (where f.tipo = 'pagamento') as ultimo_pagamento
from public.clientes c
left join public.fiado f on f.cliente_id = c.id
where c.ativo
group by c.id;

create view public.contas_abertas with (security_invoker = true) as
select c.id, c.mesa, c.nome, c.aberta_em,
  coalesce(sum(i.quantidade), 0)::integer as qtd_itens,
  coalesce(sum(i.quantidade * i.preco), 0)::integer as total
from public.contas c
left join public.itens_conta i on i.conta_id = c.id
where c.status = 'aberta'
group by c.id;
