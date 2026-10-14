/**
 * Check catalogue for nss-security-check (free).
 * Deterministic static checks only: Babel AST for JS/TS/TSX, targeted regex for SQL and env files.
 * This is a subset of the paid Launch Audit, which adds more checks, an AI auditor that reviews each
 * hit, manual IDOR/business-logic review, and a LAUNCH-AUDIT.md report with a fix plan.
 */
export const SEVERITIES = ["critical", "high", "medium", "low"];

export const CHECKS = {
  K1: { sev: "critical", area: "Keys", title: "Live Stripe secret/restricted key in source", fix: "Move it to a server env var and rotate the key in the Stripe dashboard now." },
  K2: { sev: "critical", area: "Keys", title: "Secret-looking NEXT_PUBLIC_ variable", fix: "NEXT_PUBLIC_ values ship to the browser. Rename without the prefix and read it only on the server." },
  K3: { sev: "critical", area: "Keys", title: ".env file with values tracked by git", fix: "git rm --cached the file, add it to .gitignore, and rotate every key it contained (history keeps them)." },
  K4: { sev: "critical", area: "Keys", title: "Server secret or admin client in a client component", fix: "Remove it from \"use client\" files. Call a route handler or Server Action that uses the secret on the server." },
  A1: { sev: "high", area: "Auth", title: "auth.getSession() trusted on the server", fix: "Use supabase.auth.getUser() (verifies the JWT) or getClaims() before granting access." },
  A2: { sev: "high", area: "Auth", title: "Server Action writes data without an auth check", fix: "Call getUser()/getClaims() (or your auth helper) at the top of the action and reject anonymous callers." },
  A3: { sev: "high", area: "Auth", title: "API route writes data without an auth check", fix: "Verify the user (or a shared secret for cron) before writing. Webhooks must verify signatures instead." },
  A4: { sev: "high", area: "Auth", title: "Admin client queries by a request-supplied id (IDOR)", fix: "Use the user client (RLS applies) or add .eq(\"user_id\", user.id) to the query." },
  A5: { sev: "medium", area: "Auth", title: "Open redirect from a query parameter", fix: "Only redirect to relative paths: require next.startsWith(\"/\") && !next.startsWith(\"//\")." },
  R1: { sev: "critical", area: "RLS", title: "Table created without row level security", fix: "alter table ... enable row level security; then add policies scoped to auth.uid()." },
  R2: { sev: "critical", area: "RLS", title: "Write policy with using (true) / with check (true)", fix: "Scope the policy to the owner, e.g. using (auth.uid() = user_id) with check (auth.uid() = user_id)." },
  R3: { sev: "high", area: "RLS", title: "Policy lets the anon role write", fix: "Grant insert/update/delete to authenticated only, scoped to auth.uid()." },
  R4: { sev: "high", area: "RLS", title: "security definer function without a fixed search_path", fix: "Add set search_path = '' (and schema-qualify names), or use security invoker." },
  S1: { sev: "critical", area: "Stripe", title: "Stripe webhook without signature verification", fix: "Call stripe.webhooks.constructEvent(rawBody, signature, secret) before trusting the event." },
  S2: { sev: "critical", area: "Stripe", title: "Stripe webhook parses JSON instead of the raw body", fix: "Use const body = await request.text() and pass it to constructEvent." },
  S3: { sev: "medium", area: "Stripe", title: "Stripe webhook has no idempotency on event.id", fix: "Store event.id (unique) and skip events you've already processed. Stripe retries and can deliver twice." },
  S4: { sev: "high", area: "Stripe", title: "Checkout price or amount taken from the request", fix: "Look up the price on the server from your own allow-list; never trust a client-sent price or amount." },
  S5: { sev: "high", area: "Stripe", title: "Access granted on the checkout success page", fix: "Grant only from the verified webhook. The success page should just show status." },
  H1: { sev: "medium", area: "Hardening", title: "No security headers configured", fix: "Add headers() in next.config (X-Frame-Options or CSP frame-ancestors, X-Content-Type-Options, Referrer-Policy)." },
  H2: { sev: "medium", area: "Hardening", title: "dangerouslySetInnerHTML with a non-literal value", fix: "Render text normally, or sanitise with a vetted library (e.g. DOMPurify) before injecting HTML." },
};
