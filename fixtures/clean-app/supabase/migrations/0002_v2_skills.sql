-- Migration: v2 schema used by the v2 skills (stripe-webhooks, stripe-subscriptions, nextjs-server-actions).
-- Rollback (manual):
--   alter table public.subscriptions drop column if exists cancel_at_period_end;
--   drop table if exists public.projects;

alter table public.subscriptions
  add column if not exists cancel_at_period_end boolean not null default false;

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index projects_user_id_idx on public.projects (user_id);
alter table public.projects enable row level security;

create policy "projects: select own" on public.projects
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "projects: insert own" on public.projects
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "projects: update own" on public.projects
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "projects: delete own" on public.projects
  for delete to authenticated using ((select auth.uid()) = user_id);
