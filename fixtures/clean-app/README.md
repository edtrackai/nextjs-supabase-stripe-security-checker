# Ship-Ready Demo: Next.js 16 + Supabase + Stripe

The reference app the rules in this pack are written against. Small on purpose: every file shows one pattern.

| File | Pattern |
|---|---|
| `lib/env.ts` | Lazy Zod env validation, `server-only` |
| `lib/supabase/server.ts` | User client (RLS) vs admin client (bypasses RLS) |
| `proxy.ts` | Session refresh (Next 16 replacement for middleware), webhooks excluded |
| `app/login/*` | Magic-link sign-in via Server Action |
| `app/auth/confirm/route.ts` | token_hash + PKCE code confirmation, safe redirects |
| `app/auth/signout/route.ts` | POST-only sign out |
| `app/account/page.tsx` | Protected page, access from mirrored subscription |
| `app/api/checkout/route.ts` | Server-side Checkout with `client_reference_id` |
| `app/api/webhooks/stripe/route.ts` | Raw body, signature verification, idempotency |
| `supabase/migrations/0001_init.sql` | RLS on every table |
| `tests/` | Unit tests for pure logic |

Setup: see `../docs/SETUP.md`.
