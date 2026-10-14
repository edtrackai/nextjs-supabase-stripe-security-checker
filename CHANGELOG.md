# Changelog

## 0.4.0 (2026-10-14)
- **New R5 (medium):** a `public` table in `supabase/migrations` with no explicit per-table `GRANT`. From 30 Oct 2026, Supabase stops default grants on new public tables, so the Data API answers `42501` (supabase.com/changelog/45329). It's order-aware for blanket grants and default privileges.
- **New R6 (high):** a blanket `grant ... on all tables in schema public` / `alter default privileges ... grant` to `anon`/`authenticated`.
- 24 checks (was 22). Fixtures and tests updated; demo GIF re-rendered.
- **One-line footer** linking the paid Launch Audit and AI Rules pack. It goes to stderr only when stdout is an interactive terminal. It never appears in pipes, redirects or `--json`, and it's off with `--quiet`, `NO_PROMO=1`, `CI` or `GITHUB_ACTIONS`. There are no network calls and no telemetry.
- README: "Want more?" section, `--quiet` documented, and `--quiet` in the usage line.
- The JSON `version` field reports 0.4.0.

## 0.3.0 (2026-10-14)
- S6 (webhook pending/completed idempotency) and S7 (`items.data[0]` billing period) checks; fixed truncated piped `--json`.
