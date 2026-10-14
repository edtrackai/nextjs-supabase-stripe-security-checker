-- Explicit Data API grants (Supabase stops default grants on new public tables on 30 Oct 2026:
-- supabase.com/changelog/45329). Grant only what each role needs; RLS still decides which rows.
-- customers / subscriptions: users read their own rows; only the webhook (service_role) writes.
grant select on public.customers, public.subscriptions to authenticated;
grant select, insert, update, delete on public.customers, public.subscriptions to service_role;
-- stripe_events: server-only (webhook idempotency); no client role gets access.
grant select, insert, update, delete on public.stripe_events to service_role;
-- projects: owners do CRUD through RLS policies.
grant select, insert, update, delete on public.projects to authenticated, service_role;
