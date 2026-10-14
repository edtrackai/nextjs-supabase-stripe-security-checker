-- Customers: maps Supabase users to Stripe customers. Written only by the webhook (secret key).
create table public.customers (
  user_id uuid primary key references auth.users (id) on delete cascade,
  stripe_customer_id text unique not null
);
alter table public.customers enable row level security;
create policy "read own customer" on public.customers
  for select to authenticated using ((select auth.uid()) = user_id);

-- Subscriptions: mirrored from Stripe webhooks. Users may only read their own.
create table public.subscriptions (
  id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  status text not null,
  price_id text,
  current_period_end timestamptz,
  updated_at timestamptz not null default now()
);
create index subscriptions_user_id_idx on public.subscriptions (user_id);
alter table public.subscriptions enable row level security;
create policy "read own subscriptions" on public.subscriptions
  for select to authenticated using ((select auth.uid()) = user_id);

-- Processed Stripe event ids, for webhook idempotency. No policies = no client access.
create table public.stripe_events (
  id text primary key,
  type text not null,
  received_at timestamptz not null default now()
);
alter table public.stripe_events enable row level security;
