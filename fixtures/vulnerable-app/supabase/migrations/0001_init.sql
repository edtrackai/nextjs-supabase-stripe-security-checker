create table public.profiles (id uuid primary key, plan text);
create table public.notes (id bigint primary key, user_id uuid, text text);
alter table public.notes enable row level security;
create policy "anyone can write notes" on public.notes for insert to anon with check (true);
create policy "public read" on public.notes for select using (true);
create function public.make_admin(uid uuid) returns void language sql security definer as $$
  update public.profiles set plan = 'admin' where id = uid;
$$;
