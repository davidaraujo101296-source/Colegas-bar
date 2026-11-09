-- Categorias iguais às tabelas da parede do bar: Lanches, Cervejas, Bebidas e Doses.
-- (Comidas e Outros continuam aceitas só para não quebrar dados antigos; o aplicativo não oferece mais.)
alter table public.produtos
  drop constraint produtos_categoria_check,
  add constraint produtos_categoria_check check (categoria in ('Lanches', 'Cervejas', 'Bebidas', 'Doses', 'Comidas', 'Outros')) not valid,
  alter column categoria set default 'Lanches';
