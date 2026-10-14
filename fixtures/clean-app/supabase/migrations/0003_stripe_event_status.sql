-- Migration: webhook idempotency tracks status, so a failed or crashed delivery is reprocessed on retry.
-- An event is recorded as 'pending' and set to 'completed' only after processing succeeds.
-- Existing rows were fully processed under the old flow, so they are backfilled as 'completed'.
-- Rollback (manual):
--   alter table public.stripe_events drop column if exists processed_at, drop column if exists status;

alter table public.stripe_events
  add column if not exists status text not null default 'completed'
    check (status in ('pending', 'completed')),
  add column if not exists processed_at timestamptz;
alter table public.stripe_events alter column status set default 'pending';
