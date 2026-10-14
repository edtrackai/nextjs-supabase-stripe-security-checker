// At most one Ad line per CLI run, chosen from the findings. Static text only: no network calls.
// Printed by bin/ to stderr on an interactive terminal only (never with --json, --quiet, NO_PROMO, CI or
// GITHUB_ACTIONS). The GitHub Action never prints any of these.
const UTM = "utm_source=checker-cli&utm_medium=cli&utm_campaign=nextjs-supabase-stripe-security-checker";
export const AD_GRANTS = `Ad (paid, same author): AI Rules v2 ($19; UK buyers pay $22.80 incl. VAT): its supabase-migration skill template writes per-table grants before RLS and policies: https://edtrackai.github.io/ai-rules?${UTM}&utm_content=r5`;
export const AD_WEBHOOK = `Ad (paid, same author): Launch Audit ($12; UK buyers pay $14.40 incl. VAT) runs 28 checks on your repo, including Stripe webhooks: https://edtrackai.github.io/launch-audit?${UTM}&utm_content=s3`;
const gumroad = (slug) => `https://luxurydrive0.gumroad.com/l/${slug}?${UTM}`;
export const AD_GENERIC = `Ad (paid tools from the same author): 28-check Launch Audit $12 ${gumroad("launch-audit")} · AI Rules pack $19 ${gumroad("ffjsf")}  (hide: --quiet or NO_PROMO=1)`;

/** The one Ad line for this run. Grants findings (R5/R6) win and never get the Launch Audit line. */
export function adLine(findings) {
  const ids = new Set(findings.map((f) => f.id));
  if (ids.has("R5") || ids.has("R6")) return AD_GRANTS;
  if (["S1", "S2", "S3", "S6"].some((id) => ids.has(id))) return AD_WEBHOOK;
  return AD_GENERIC;
}
