-- BAD: blanket true policy
create policy "public read all"
  on public.profiles
  for select
  using (true);

create policy "anyone write"
  on public.profiles
  for insert
  with check (true);
