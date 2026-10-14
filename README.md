# Next.js + Supabase + Stripe security checker

**Free, MIT, zero-dependency** heuristic CLI that flags common security mistakes AI coding agents leave in Next.js apps wired to Supabase and Stripe.

Made by **[Stack & Ship](https://edtrackai.github.io)** — indie digital products for solo founders shipping AI-assisted stacks.

> Not affiliated with Vercel, Supabase, or Stripe. This is static pattern matching, **not** a penetration test and **not** a guarantee your app is safe.

## What it checks

| Id | Severity | Heuristic |
|----|----------|-----------|
| **SR1** | critical | `SUPABASE_SERVICE_ROLE` / service-role client outside trusted server-only paths (and always in `"use client"` files) |
| **GS1** | high | `getSession(` used for auth — prefer `getUser()` / `getClaims()` |
| **SW1** | critical | Stripe webhook `route` without `constructEvent` + obvious raw-body pattern (or `request.json()` before verify) |
| **S5** | high | Grant / `update`/`upsert`/`insert` on a checkout **success** page when Stripe session context is present |
| **R2** | critical | SQL/migrations with `using (true)`, `with check (true)`, or `qual = 'true'` |

Heuristics are intentionally simple and documented in `lib/checks.js`. Prefer false positives over silent misses — every hit is a review prompt, not a verdict.

## Score

Starts at **100**. Each finding subtracts a weight (critical 25, high 15, medium 8, low 3), floored at 0. **Exit code is always 0** so the tool is safe in exploratory scripts; parse stdout / `--json` if you want to gate CI yourself.

## How to run

Requires **Node 18+**. No `npm install` needed (zero runtime dependencies).

```bash
# From a clone of this repo
node bin/nss-security-check.js /path/to/your/app

# JSON report
node bin/nss-security-check.js /path/to/your/app --json

# Or link it as a command (from the clone): npm link, then
nss-security-check .
```

Default target directory is `.`.

### Smoke test (this repo)

```bash
npm run smoke
# → PASS when fixtures produce SR1, GS1, SW1, S5, R2
```

## Honest limits

- **No AST / typechecker** — string and regex heuristics only.
- **No secret scanning of live key material** beyond naming patterns (rotate anything that was ever committed).
- **Won’t catch** IDOR logic bugs, missing RLS on tables you never migrate in-repo, SSRF, dependency CVEs, or Dashboard misconfig (Auth redirect URLs, Stripe Radar, etc.).
- **False positives** are expected (e.g. a carefully isolated admin module that isn’t in our “trusted path” allowlist).
- **False negatives** are expected (obfuscated grants, dynamic `import()`, codegen SQL, edge cases).

For rules that stop your AI agent writing these bugs in the first place, see Ship-Ready AI Rules below.

## Related products (Stack & Ship)

- **Free Supabase + Stripe Security Checklist** (20 checks, PDF):  
  https://luxurydrive0.gumroad.com/l/security-checklist?utm_source=github&utm_medium=readme&utm_campaign=nextjs-supabase-stripe-security-checker
- **Ship-Ready AI Rules** (Cursor / Claude Code rules that avoid these footguns):  
  https://luxurydrive0.gumroad.com/l/ffjsf?utm_source=github&utm_medium=readme&utm_campaign=nextjs-supabase-stripe-security-checker
- **Free AI Rules sample + site**:  
  https://edtrackai.github.io/ai-rules?utm_source=github&utm_medium=readme&utm_campaign=nextjs-supabase-stripe-security-checker

## License

MIT — see [LICENSE](./LICENSE).

## Maker disclosure

Built and published by **Stack & Ship** (`edtrackai`) as a free open-source lead magnet during our Oct 2026 launch sprint. The scanner is useful on its own; the Gumroad links above are how we fund more free tools. No telemetry. No phoning home.
