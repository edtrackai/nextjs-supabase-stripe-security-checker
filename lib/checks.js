/**
 * Heuristic checks for common Next.js + Supabase + Stripe AI-agent footguns.
 *
 * Design goals (honest limits):
 * - Pattern matching only — no AST, no type info, no runtime execution.
 * - Prefer false positives over silent misses; every hit is a review prompt.
 * - Documented below so maintainers know what each rule looks for.
 *
 * Severity weights (for the score): critical=25, high=15, medium=8, low=3.
 * Score starts at 100 and subtracts weights (floor 0). Exit code is always 0.
 */

export const CHECKS = {
  SR1: {
    id: "SR1",
    sev: "critical",
    title: "Service-role / SUPABASE_SERVICE_ROLE outside trusted server paths",
    why: "The service-role key bypasses RLS. If it lands in a client bundle or a casually imported module, every table is readable/writable.",
    fix: "Keep the service-role client in server-only modules (route handlers, Server Actions with `import \"server-only\"`, webhooks/cron). Never under `\"use client\"` or `NEXT_PUBLIC_*`.",
  },
  GS1: {
    id: "GS1",
    sev: "high",
    title: "getSession() used (prefer getUser / getClaims for auth decisions)",
    why: "auth.getSession() reads the cookie without verifying the JWT with the Auth server. Spoofable sessions can pass local checks.",
    fix: "Use supabase.auth.getUser() (or getClaims() for read-only page gates) before granting access or mutating data.",
  },
  SW1: {
    id: "SW1",
    sev: "critical",
    title: "Stripe webhook route without constructEvent / raw-body pattern",
    why: "Without signature verification on the raw body, anyone can POST a fake `checkout.session.completed` and unlock paid features.",
    fix: "Read `await request.text()`, then `stripe.webhooks.constructEvent(rawBody, signature, secret)` before parsing JSON or granting access.",
  },
  S5: {
    id: "S5",
    sev: "high",
    title: "Access / grant on a checkout success URL page",
    why: "The success page is user-controllable (they can hit it without paying). Granting there is replayable and skips webhook confirmation.",
    fix: "Grant entitlements only from the verified Stripe webhook; the success page should only show status / poll.",
  },
  R2: {
    id: "R2",
    sev: "critical",
    title: "RLS policy using (true) / with check (true) / qual = 'true'",
    why: "A blanket true policy means every role that has the policy can read or write every row.",
    fix: "Scope policies to `auth.uid()` (or a membership check). Remove `using (true)` unless the table is intentionally public-read.",
  },
};

export const SEV_WEIGHT = { critical: 25, high: 15, medium: 8, low: 3 };

export const SKIP_DIRS = new Set([
  "node_modules",
  ".next",
  ".git",
  "dist",
  "build",
  "out",
  ".vercel",
  "coverage",
  ".turbo",
  ".cache",
  "fixtures", // don't scan our own demo fixtures when run from this package root
]);

export const CODE_RE = /\.(ts|tsx|js|jsx|mjs|cjs)$/;
export const SQL_RE = /\.sql$/;

/** Paths where a service-role client is usually intentional. */
export function isTrustedServerPath(rel) {
  return (
    /(^|\/)(app\/api\/(webhooks|cron|stripe)|lib\/supabase(\/|\.[jt]sx?$)|lib\/billing\/|scripts\/|supabase\/functions\/)/.test(
      rel
    ) || /\.(test|spec)\.[jt]sx?$/.test(rel)
  );
}

export function isClientFile(text) {
  return /^\s*["']use client["']/m.test(text);
}

export function hasServerOnlyImport(text) {
  return /import\s+["']server-only["']/.test(text);
}

export function lineOf(text, index) {
  return text.slice(0, index).split("\n").length;
}

export function snippetAt(text, line) {
  return (text.split("\n")[line - 1] ?? "").trim().slice(0, 160);
}
