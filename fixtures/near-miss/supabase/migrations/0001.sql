create table public.posts (id bigint primary key, user_id uuid, body text);
alter table public.posts enable row level security;
-- create policy "bad" on public.posts for all using (true);
create policy "public read" on public.posts for select using (true);
create policy "own writes" on public.posts for insert to authenticated with check (auth.uid() = user_id);
create function public.is_owner(pid bigint) returns boolean language sql security definer set search_path = '' as $$
  select exists (select 1 from public.posts where id = pid and user_id = auth.uid());
$$;
grant select on public.posts to anon, authenticated;
grant insert on public.posts to authenticated;
