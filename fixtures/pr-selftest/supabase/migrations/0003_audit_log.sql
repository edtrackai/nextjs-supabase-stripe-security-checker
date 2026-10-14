create table public.audit_log (id bigint primary key, user_id uuid, action text);
alter table public.audit_log enable row level security;
create policy "own log" on public.audit_log for select to authenticated using (auth.uid() = user_id);
