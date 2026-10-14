#!/usr/bin/env node
import { resolve } from "node:path";
import { existsSync, statSync } from "node:fs";
import { scan } from "../lib/scan.js";
import { CHECKS, SEVERITIES } from "../lib/checks.js";

const args = process.argv.slice(2);
if (args.includes("-h") || args.includes("--help")) {
  console.log(`Usage: nss-security-check [directory] [--json] [--fail-on=critical|high|medium|low|none] [--list]

Scan a Next.js + Supabase + Stripe project for ${Object.keys(CHECKS).length} common security mistakes (static analysis, no network).

  --json        machine-readable output
  --fail-on=X   exit 1 if any finding is at severity X or worse (default: none, always exit 0)
  --list        list all checks and exit
  --quiet       omit the one-line footer about the paid tools (also off with NO_PROMO=1 or CI=true)`);
  process.exit(0);
}
if (args.includes("--list")) {
  for (const [id, c] of Object.entries(CHECKS)) console.log(`${id.padEnd(3)} ${c.sev.padEnd(8)} ${c.area.padEnd(9)} ${c.title}`);
  process.exit(0);
}
const failOn = (args.find((a) => a.startsWith("--fail-on="))?.split("=")[1] ?? "none").toLowerCase();
if (failOn !== "none" && !SEVERITIES.includes(failOn)) { console.error(`--fail-on must be one of ${SEVERITIES.join(", ")}, none`); process.exit(2); }
const dir = resolve(args.find((a) => !a.startsWith("-")) ?? ".");
if (!existsSync(dir) || !statSync(dir).isDirectory()) { console.error(`Not a directory: ${dir}`); process.exit(2); }

const r = scan(dir);
const failing = failOn === "none" ? [] : r.findings.filter((f) => SEVERITIES.indexOf(f.sev) <= SEVERITIES.indexOf(failOn));

if (args.includes("--json")) console.log(JSON.stringify(r, null, 2));
else {
  const tty = process.stdout.isTTY || process.env.FORCE_COLOR;
  const c = (code, s) => (tty ? `\x1b[${code}m${s}\x1b[0m` : s);
  const col = { critical: "1;31", high: "31", medium: "33", low: "36" };
  console.log(c("1", `nss-security-check v${r.version}`) + `  ${r.filesScanned} files · ${Object.keys(CHECKS).length} checks\n`);
  if (!r.findings.length) console.log(c("32", "✓ No findings.") + " Static checks only: this is not proof the app is secure.");
  for (const f of r.findings) {
    console.log(`${c(col[f.sev], f.sev.toUpperCase().padEnd(8))} ${c("1", f.id)}  ${f.title}`);
    console.log(`         ${c("2", `${f.file}:${f.line}`)}  ${f.evidence}`);
    console.log(`         ${c("2", "fix:")} ${f.fix}\n`);
  }
  console.log(SEVERITIES.map((s) => `${s} ${r.counts[s]}`).join(" · "));
  if (r.findings.length) console.log(c("2", "Each hit is a prompt to review, not a verdict."));
  // One static footer line: no network call, no tracking beyond the UTM tags in the printed links.
  const env = process.env;
  const promoOff = args.includes("--quiet") || (env.NO_PROMO && env.NO_PROMO !== "0") || (env.CI && env.CI !== "false" && env.CI !== "0");
  if (!promoOff) {
    const u = (slug) => `https://luxurydrive0.gumroad.com/l/${slug}?utm_source=checker-cli&utm_medium=cli&utm_campaign=nextjs-supabase-stripe-security-checker`;
    console.log(c("2", `\nWant more? Full 28-check Launch Audit: ${u("launch-audit")} · AI Rules pack: ${u("ffjsf")}  (hide: --quiet or NO_PROMO=1)`));
  }
}
process.exitCode = failing.length ? 1 : 0; // not process.exit(): it can truncate large piped output
