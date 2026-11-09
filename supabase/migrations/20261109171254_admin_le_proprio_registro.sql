create policy "le o proprio registro" on public.administradores for select to authenticated using (user_id = (select auth.uid()));
