# nextjs-supabase-stripe-security-checker

**Your AI agent shipped the app. Did it also ship your Stripe secret key, a table without RLS, or a webhook that anyone can call?** One command finds out, locally, in under a second.

![Demo: 22 checks catch leaked keys, missing RLS and unsafe Stripe webhooks, then a clean app passes --fail-on](docs/demo.gif)

## Quick start

```bash
git clone https://github.com/edtrackai/nextjs-supabase-stripe-security-checker.git
cd nextjs-supabase-stripe-security-checker && npm install
node bin/nss-security-check.js /path/to/your/app
```

Node 18 or later. There's one dependency (`@babel/parser`). It's free and MIT-licensed, needs no account, makes no network calls and never uploads your code. It isn't on npm yet, so `npx` won't work.

- **22 checks** across leaked keys, server auth, Supabase RLS, Stripe webhooks/checkout and hardening. It uses AST parsing where regex would be fragile.
- **Low noise:** 0 findings on a hardened reference app and on a "near-miss" fixture of safe code that looks like each bug.
- **CI-ready:** `--fail-on=high` exits 1, and `--json` gives machine-readable output.

## Options

| Flag | What it does |
|---|---|
| `--json` | Machine-readable output: `{tool, version, root, filesScanned, counts, findings[]}` |
| `--fail-on=<sev>` | Exit 1 if any finding is at or above `critical` / `high` / `medium` / `low` (`none` never fails). Exit 2 on bad arguments. |
| `--list` | Print the check catalogue |
| `--quiet` | Omit the one-line footer about the paid tools (also off with `NO_PROMO=1` or `CI=true`) |
| `--help` | Usage |

In CI: `node path/to/bin/nss-security-check.js . --fail-on=high`

## The 22 checks

| ID | Severity | Area | Check |
|---|---|---|---|
| K1 | critical | Keys | Live Stripe secret/restricted key (`sk_live_`/`rk_live_`) in source, including keys split with `+` (evidence is redacted) |
| K2 | critical | Keys | Secret-looking `NEXT_PUBLIC_` variable (service role, secret key, webhook secret…) |
| K3 | critical | Keys | `.env` file with values tracked by git |
| K4 | critical | Keys | Server secret or Supabase admin client used in a `"use client"` component |
| A1 | high | Auth | `auth.getSession()` trusted on the server instead of `getUser()`/`getClaims()` |
| A2 | high | Auth | Server Action writes data with no auth check |
| A3 | high | Auth | API route (POST/PUT/PATCH/DELETE) writes data with no auth check (webhook, cron and auth routes excluded) |
| A4 | high | Auth | Admin client queried by a request-supplied id with no owner filter (IDOR) |
| A5 | medium | Auth | Open redirect from a query parameter |
| R1 | critical | RLS | Table created without row level security |
| R2 | critical | RLS | Write policy with `using (true)` / `with check (true)` |
| R3 | high | RLS | Policy that lets the `anon` role write |
| R4 | high | RLS | `security definer` function without a fixed `search_path` |
| S1 | critical | Stripe | Webhook without signature verification (`constructEvent`) |
| S2 | critical | Stripe | Webhook parses `request.json()` instead of the raw body |
| S3 | medium | Stripe | Webhook has no idempotency on `event.id` |
| S4 | high | Stripe | Checkout price or amount taken from the request |
| S5 | high | Stripe | Access granted on the checkout success page instead of in the webhook |
| S6 | medium | Stripe | Webhook dedupe that can swallow a failed event: duplicates skipped with no `pending`/`completed` status |
| S7 | low | Stripe | Billing period read from `items.data[0]` (wrong for multi-item subscriptions since API 2025-03-31.basil) |
| H1 | medium | Hardening | No security headers in `next.config` |
| H2 | medium | Hardening | `dangerouslySetInnerHTML` with a non-literal value |

## How it's tested

- `fixtures/vulnerable-app` triggers all 21 file-based checks, and the tests assert each one at the expected file. K3 is tested on a temporary git repo.
- `fixtures/clean-app` (a hardened reference app) and `fixtures/near-miss` (safe code that *looks* like each mistake: raw-body webhooks with pending/completed idempotency, multi-item-safe period lookup, guarded redirects, owner-filtered admin queries, `select using (true)`, JSON-LD) must produce **0 findings**.
- `npm test` runs the node:test suite, including the CLI flags and exit codes. `npm run smoke` gives a one-line summary.

## Honest limits

- It's a **heuristic static scanner**. A clean run doesn't prove an app is secure, and a finding is a prompt to review, not a verdict.
- It doesn't follow data across files or functions. An auth check hidden in a helper it doesn't recognise can produce an A2/A3 false positive. Helpers named like `requireUser*`, `getUser*`, `verifySession*`, `assertAuth*`, `auth()`, `currentUser()` and `protect()` are recognised.
- RLS checks read SQL in `supabase/migrations` and `.sql` files only. Policies created in the dashboard aren't visible to it.
- It doesn't check your live Supabase project, Stripe dashboard settings, dependencies (use `npm audit`) or full git history for secrets (use gitleaks).
- It's a small free subset of the checks in our paid Launch Audit. There's no AI review, no written report and no fix plan here.

## Want more?
This free CLI is a small subset. If you're about to launch:
- **[Launch Audit](https://luxurydrive0.gumroad.com/l/launch-audit?utm_source=checker-readme&utm_medium=readme&utm_campaign=nextjs-supabase-stripe-security-checker):** 28 automated checks plus a read-only auditor agent for the manual checks, giving a ready / not-ready report with a fix plan.
- **[Ship-Ready AI Rules](https://luxurydrive0.gumroad.com/l/ffjsf?utm_source=checker-readme&utm_medium=readme&utm_campaign=nextjs-supabase-stripe-security-checker):** rules, skills and guardrail hooks that stop AI coding agents writing these bugs in the first place.
- **[Ship It Bundle](https://luxurydrive0.gumroad.com/l/ship-it-bundle?utm_source=checker-readme&utm_medium=readme&utm_campaign=nextjs-supabase-stripe-security-checker):** AI Rules + Launch Audit + Solo Founder OS Pro in one purchase.
- **[Paid MCP Starter](https://luxurydrive0.gumroad.com/l/paid-mcp-starter?utm_source=checker-readme&utm_medium=readme&utm_campaign=nextjs-supabase-stripe-security-checker):** charge for your MCP server with Next.js + Supabase + Stripe.
- Free: [security checklist](https://luxurydrive0.gumroad.com/l/security-checklist?utm_source=checker-readme&utm_medium=readme&utm_campaign=nextjs-supabase-stripe-security-checker) · [AI rules](https://edtrackai.github.io/ai-rules?utm_source=checker-readme&utm_medium=readme&utm_campaign=nextjs-supabase-stripe-security-checker)

The human-readable output ends with one line linking the Launch Audit and AI Rules pack. It's plain text: the CLI makes no network calls and collects no telemetry. Hide it with `--quiet` or `NO_PROMO=1`; it's off automatically when `CI=true`. `--json` output never includes it.

## License

MIT
