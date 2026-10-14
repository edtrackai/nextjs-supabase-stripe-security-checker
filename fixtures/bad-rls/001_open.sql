alter table public.items enable row level security;
create policy "open" on public.items for all using (true) with check (true);
-- alternate form sometimes emitted by generators
-- qual = 'true'
