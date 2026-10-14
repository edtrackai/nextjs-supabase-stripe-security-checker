import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, writeFileSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scan } from "../lib/scan.js";
import { CHECKS } from "../lib/checks.js";

const fx = (n) => new URL(`../fixtures/${n}/`, import.meta.url).pathname;
const bin = new URL("../bin/nss-security-check.js", import.meta.url).pathname;
const vuln = scan(fx("vulnerable-app"), { git: false });
const at = (id, file) => vuln.findings.some((f) => f.id === id && f.file === file);

test("catalogue has at least 15 checks, each with severity, title and fix", () => {
  assert.ok(Object.keys(CHECKS).length >= 15);
  for (const c of Object.values(CHECKS)) assert.ok(c.sev && c.title && c.fix);
});

test("every check except K3 (needs git) fires on the vulnerable fixture, at the right file", () => {
  const expect = {
    K1: "lib/stripe.ts", K2: ".env.local", K4: "components/AdminPanel.tsx", A1: "app/dashboard/page.tsx",
    A2: "app/dashboard/actions.ts", A3: "app/api/notes/route.ts", A4: "app/api/admin/[id]/route.ts", A5: "app/auth/callback/route.ts",
    R1: "supabase/migrations/0001_init.sql", R2: "supabase/migrations/0001_init.sql", R3: "supabase/migrations/0001_init.sql", R4: "supabase/migrations/0001_init.sql",
    S1: "app/api/webhooks/stripe/route.ts", S2: "app/api/webhooks/stripe/route.ts", S3: "app/api/webhooks/stripe/route.ts", S4: "app/api/checkout/route.ts",
    S5: "app/checkout/success/page.tsx", S6: "app/api/webhooks/billing/route.ts", S7: "app/api/webhooks/billing/route.ts",
    H1: "next.config.js", H2: "components/Bio.tsx",
  };
  for (const [id, file] of Object.entries(expect)) assert.ok(at(id, file), `${id} @ ${file}`);
  assert.deepEqual(Object.keys(CHECKS).filter((id) => id !== "K3" && !(id in expect)), []);
});

test("precision on the vulnerable fixture: exact lines and no stray hits", () => {
  const r1 = vuln.findings.filter((f) => f.id === "R1");
  assert.deepEqual(r1.map((f) => f.evidence), ["table profiles"]); // notes has RLS
  assert.equal(vuln.findings.filter((f) => f.id === "R2").length, 1); // select using(true) is not flagged
  assert.equal(vuln.findings.filter((f) => f.id === "A2").length, 1); // readOnly() is not flagged
  assert.ok(!vuln.findings.some((f) => f.id === "A3" && f.file.includes("checkout"))); // checkout checks getUser
});

test("K3: a .env file with values tracked by git is flagged; untracked is not", () => {
  const d = mkdtempSync(join(tmpdir(), "nss-"));
  cpSync(fx("clean-app"), d, { recursive: true });
  writeFileSync(join(d, ".env.local"), "STRIPE_SECRET_KEY=sk_test_x\n");
  assert.ok(!scan(d).findings.some((f) => f.id === "K3"));
  for (const a of [["init", "-q"], ["add", "-f", ".env.local"]]) spawnSync("git", a, { cwd: d });
  assert.ok(scan(d).findings.some((f) => f.id === "K3" && f.file === ".env.local"));
});

test("0 findings on the clean reference app (Ship-Ready demo) and on the near-miss fixture", () => {
  assert.deepEqual(scan(fx("clean-app"), { git: false }).findings, []);
  assert.deepEqual(scan(fx("near-miss"), { git: false }).findings, []);
});

test("K1: a plain live-key literal is caught (written at test time so no key-shaped string is committed)", () => {
  const d = mkdtempSync(join(tmpdir(), "nss-"));
  writeFileSync(join(d, "pay.ts"), `export const k = "${"sk_" + "live_" + "51FAKEFAKEFAKEFAKE0000"}";\n`);
  const k1 = scan(d, { git: false }).findings.filter((f) => f.id === "K1");
  assert.equal(k1.length, 1);
  assert.match(k1[0].evidence, /redacted/);
});

test("secrets are redacted in evidence", () => {
  const k1 = vuln.findings.filter((f) => f.id === "K1");
  assert.ok(k1.length >= 1);
  for (const f of k1) assert.doesNotMatch(f.evidence, /sk_live_[0-9a-zA-Z]{16,}/);
});

test("S6/S7 stay quiet on the pending/completed webhook and the multi-item-safe period lookup", () => {
  const nm = scan(fx("near-miss"), { git: false }).findings;
  assert.ok(!nm.some((f) => f.id === "S6" || f.id === "S7"));
  assert.equal(vuln.findings.filter((f) => f.id === "S6").length, 1);
  assert.equal(vuln.findings.filter((f) => f.id === "S7").length, 1);
});

test("CLI: --json, --fail-on exit codes, --list, bad args", () => {
  const run = (...a) => spawnSync(process.execPath, [bin, ...a], { encoding: "utf8" });
  const j = JSON.parse(run(fx("vulnerable-app"), "--json").stdout);
  assert.equal(j.tool, "nss-security-check");
  assert.ok(j.findings.length >= 21);
  assert.equal(run(fx("vulnerable-app")).status, 0);
  assert.equal(run(fx("vulnerable-app"), "--fail-on=high").status, 1);
  assert.equal(run(fx("clean-app"), "--fail-on=low").status, 0);
  assert.equal(run(fx("near-miss"), "--fail-on=low").status, 0);
  assert.equal(run("--list").stdout.trim().split("\n").length, Object.keys(CHECKS).length);
  assert.equal(run(fx("clean-app"), "--fail-on=bogus").status, 2);
  assert.equal(run("/nope/does-not-exist").status, 2);
});

test("CLI footer: shown in human output, absent with --json, --quiet, NO_PROMO, CI=true; no network code", () => {
  const env0 = { ...process.env }; delete env0.CI; delete env0.NO_PROMO; delete env0.FORCE_COLOR;
  const run = (env, ...a) => spawnSync(process.execPath, [bin, fx("vulnerable-app"), ...a], { encoding: "utf8", env: { ...env0, ...env } }).stdout;
  const has = (o) => o.includes("Want more?") && o.includes("utm_source=checker-cli&utm_medium=cli&utm_campaign=nextjs-supabase-stripe-security-checker");
  const out = run({});
  assert.ok(has(out) && /28-check Launch Audit/.test(out) && /l\/launch-audit\?/.test(out) && /l\/ffjsf\?/.test(out));
  assert.equal(out.trimEnd().split("\n").at(-1).includes("Want more?"), true, "footer is the last line");
  assert.equal(has(run({ CI: "false" })), true);
  for (const o of [run({}, "--quiet"), run({ NO_PROMO: "1" }), run({ CI: "true" })]) assert.equal(o.includes("Want more?"), false);
  const j = run({}, "--json"); assert.equal(j.includes("Want more?") || j.includes("utm_"), false); JSON.parse(j);
  const src = readFileSync(bin, "utf8") + readdirSync(new URL("../lib/", import.meta.url)).map((f) => readFileSync(new URL(`../lib/${f}`, import.meta.url), "utf8")).join("");
  assert.equal(/\bfetch\(|node:https?|node:net|node:dgram|XMLHttpRequest/.test(src), false);
});
