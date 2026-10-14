# Changelog

## 0.6.0 (2026-10-14)
- The terminal Ad line now depends on the findings, and there is still at most one per run: an R5/R6 (Supabase grants) finding shows the AI Rules v2 line, an S1/S2/S3/S6 (Stripe webhook) finding shows the Launch Audit line, and anything else shows the previous generic footer. The Launch Audit line is never shown for a grants finding. Same gating as before: stderr only, interactive terminal only, off with `--json`, `--quiet`, `NO_PROMO=1`, `CI` or `GITHUB_ACTIONS`. The GitHub Action's comment and summary stay ad-free. No check changes (24).

## 0.5.1 (2026-10-14)
- Fix-text wording for S3 and S6: reprocess a still-pending Stripe event only when handlers are idempotent upserts keyed on Stripe ids, or after an atomic lease claim (`locked_until`) so a crashed attempt can be reclaimed; side effects (emails, credit grants) need their own dedupe key. The checks themselves (detection, severities, count of 24) are unchanged.
- Clean fixture comment updated to match.

## 0.5.0 (2026-10-14)
- **GitHub Action** (`action.yml`, composite): job summary, file/line annotations, and one sticky PR comment that's updated on re-runs. Inputs `path`, `fail-on`, `comment`, `github-token`; outputs `findings`, `failing`, `comment-id`. Evidence is redacted; no ads in CI. See docs/github-action.md. Use `@v0` or pin `@v0.5.0`.
- The comment is matched only on comments by `github-actions[bot]`, and the hidden marker includes the scan path, so several action steps in one PR keep separate comments. Path-less v0.4.x comments are adopted.
- When the scanned folder isn't a git repo (or git is missing), K3 is skipped with a note in the text output, `--json` (`notes`) and a workflow warning, instead of silently.

## 0.4.1 (2026-10-14)
- The terminal footer is now labelled as an ad, per a marketing compliance review (UK CAP Code 2.1/2.3): "Ad (paid tools from the same author): 28-check Launch Audit $12 <link> · AI Rules pack $19 <link> (hide: --quiet or NO_PROMO=1)". It is still stderr-only, shown only on an interactive terminal, and off in CI, pipes, redirects and `--json`.
- README "Want more?" opens with an ad/ownership disclosure.

## 0.4.0 (2026-10-14)
- **New R5 (medium):** a `public` table in `supabase/migrations` with no explicit per-table `GRANT`. From 30 Oct 2026, Supabase stops default grants on new public tables, so the Data API answers `42501` (supabase.com/changelog/45329). It's order-aware for blanket grants and default privileges.
- **New R6 (high):** a blanket `grant ... on all tables in schema public` / `alter default privileges ... grant` to `anon`/`authenticated`.
- 24 checks (was 22). Fixtures and tests updated; demo GIF re-rendered.
- **One-line footer** linking the paid Launch Audit and AI Rules pack. It goes to stderr only when stdout is an interactive terminal. It never appears in pipes, redirects or `--json`, and it's off with `--quiet`, `NO_PROMO=1`, `CI` or `GITHUB_ACTIONS`. There are no network calls and no telemetry.
- README: "Want more?" section, `--quiet` documented, and `--quiet` in the usage line.
- The JSON `version` field reports 0.4.0.

## 0.3.0 (2026-10-14)
- S6 (webhook pending/completed idempotency) and S7 (`items.data[0]` billing period) checks; fixed truncated piped `--json`.
