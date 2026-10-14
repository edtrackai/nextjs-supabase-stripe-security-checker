// GitHub Action: formatter/summary unit tests + a simulated run (env vars + mocked GitHub API).
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scan } from "../lib/scan.js";
import { formatComment, formatSummary, redact, failing, MARKER } from "../action/format.mjs";
import { upsertComment } from "../action/github.mjs";

const fx = (n) => new URL(`../fixtures/${n}/`, import.meta.url).pathname;
const RUN = new URL("../action/run.mjs", import.meta.url).pathname;
const vuln = scan(fx("vulnerable-app"), { git: false });
const clean = scan(fx("clean-app"), { git: false });
const fake = (findings) => ({ version: "9.9.9", filesScanned: 3, counts: { critical: 0, high: 0, medium: 0, low: 0 }, findings });
const F = (o) => ({ id: "K1", sev: "critical", title: "Live key", file: "a.ts", line: 1, evidence: "x", fix: "rotate", ...o });

test("formatComment: marker, status, counts, table, fixes, links", () => {
  const c = formatComment(vuln, { failOn: "high", link: (f) => `https://gh/x/blob/sha/${f.file}#L${f.line}`, runUrl: "https://gh/run/1", sha: "abcdef1234" });
  assert.ok(c.startsWith(MARKER));
  assert.match(c, /❌ \d+ finding\(s\) at or above `high`/);
  assert.match(c, /\| Severity \| Check \| Location \| Evidence \|/);
  assert.match(c, /\[`supabase\/migrations\/0003_audit_log\.sql:1`\]\(https:\/\/gh\/x\/blob\/sha\/supabase\/migrations\/0003_audit_log\.sql#L1\)/);
  assert.match(c, /<details><summary>How to fix<\/summary>/);
  assert.match(c, /\*\*R5:\*\*/);
  assert.match(c, /`abcdef1`/);
  assert.match(c, /\[Workflow run\]\(https:\/\/gh\/run\/1\)/);
  for (const f of vuln.findings) assert.ok(c.includes(`**${f.id}**`), f.id);
});

test("formatComment: clean, below-threshold and fail-on none states", () => {
  assert.match(formatComment(clean, {}), /✅ No findings/);
  assert.match(formatComment(fake([F({ sev: "low" })]), { failOn: "high" }), /⚠️ 1 finding\(s\), none at or above `high`/);
  assert.equal(failing(vuln, "none").length, 0);
  assert.ok(failing(vuln, "critical").every((f) => f.sev === "critical"));
});

test("redaction: secret-shaped evidence never reaches the comment or summary", () => {
  const live = ["sk", "live", "a".repeat(24)].join("_"), wh = ["whsec", "b".repeat(24)].join("_");
  const jwt = ["eyJ" + "h".repeat(20), "p".repeat(20), "s".repeat(20)].join(".");
  const pat = "ghp_" + "c".repeat(36), sbs = "sb_secret_" + "d".repeat(20), db = "postgresql://user:hunter2pass@db.example.com/x";
  const r = fake([F({ evidence: `${live} ${wh} ${jwt}` }), F({ id: "K4", evidence: `${pat} ${sbs} ${db}`, fix: `use ${live}` })]);
  for (const out of [formatComment(r, {}), formatSummary(r, {})])
    for (const s of [live, wh, jwt, pat, sbs, "hunter2pass"]) assert.equal(out.includes(s), false, s);
  assert.match(redact(db), /postgresql:\/\/user:\[redacted\]@db/);
  assert.equal(redact("plain text"), "plain text");
});

test("table cells escape pipes, backticks and newlines", () => {
  const c = formatComment(fake([F({ title: "a|b", evidence: "x`y|z\nw" })]), {});
  assert.match(c, /a\\\|b/); assert.match(c, /`xˋy\\\|z w`/);
});

test("formatComment stays under GitHub's 65,536-char limit for huge result sets", () => {
  const many = fake(Array.from({ length: 3000 }, (_, i) => F({ line: i + 1, evidence: "e".repeat(130) })));
  const c = formatComment(many, {});
  assert.ok(c.length <= 60000, String(c.length)); assert.match(c, /…and \d+ more/);
});

test("formatSummary: pass/fail line and table", () => {
  assert.match(formatSummary(vuln, { failOn: "high" }), /fail-on: `high` → \*\*failed \(\d+\)\*\*/);
  assert.match(formatSummary(clean, { failOn: "high" }), /→ \*\*passed\*\*[\s\S]*✅ No findings/);
});

// ---------- mocked GitHub API + simulated runner
function mockGitHub() {
  const comments = [], calls = [];
  let nextId = 100;
  const srv = createServer((req, res) => {
    let data = ""; req.on("data", (c) => (data += c));
    req.on("end", () => {
      calls.push({ method: req.method, url: req.url, auth: req.headers.authorization });
      const send = (code, obj) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(obj)); };
      if (req.headers.authorization !== "Bearer test-token") return send(403, { message: "Resource not accessible by integration" });
      let m;
      if (req.method === "GET" && (m = req.url.match(/^\/repos\/o\/r\/issues\/7\/comments\?/))) return send(200, comments);
      if (req.method === "POST" && req.url === "/repos/o/r/issues/7/comments") { const c = { id: nextId++, body: JSON.parse(data).body }; comments.push(c); return send(201, c); }
      if (req.method === "PATCH" && (m = req.url.match(/^\/repos\/o\/r\/issues\/comments\/(\d+)$/))) { const c = comments.find((x) => x.id === +m[1]); c.body = JSON.parse(data).body; return send(200, c); }
      send(404, {});
    });
  });
  return new Promise((ok) => srv.listen(0, "127.0.0.1", () => ok({ srv, comments, calls, url: `http://127.0.0.1:${srv.address().port}` })));
}
function runAction(env) {
  const d = mkdtempSync(join(tmpdir(), "nss-act-"));
  const files = { GITHUB_STEP_SUMMARY: join(d, "summary.md"), GITHUB_OUTPUT: join(d, "out.txt"), GITHUB_EVENT_PATH: join(d, "event.json") };
  writeFileSync(files.GITHUB_EVENT_PATH, JSON.stringify(env.event ?? {}));
  const base = { PATH: process.env.PATH, GITHUB_REPOSITORY: "o/r", GITHUB_SHA: "deadbeefcafe", GITHUB_RUN_ID: "42", GITHUB_SERVER_URL: "https://github.com", GITHUB_WORKSPACE: new URL("..", import.meta.url).pathname, ...files };
  delete env.event;
  return new Promise((ok) => {
    const p = spawn(process.execPath, [RUN], { env: { ...base, ...env } });
    let stdout = ""; p.stdout.on("data", (c) => (stdout += c)); p.stderr.on("data", (c) => (stdout += c));
    p.on("close", (code) => ok({ code, stdout, summary: existsSync(files.GITHUB_STEP_SUMMARY) ? readFileSync(files.GITHUB_STEP_SUMMARY, "utf8") : "", outputs: Object.fromEntries((existsSync(files.GITHUB_OUTPUT) ? readFileSync(files.GITHUB_OUTPUT, "utf8") : "").trim().split("\n").filter(Boolean).map((l) => l.split("="))) }));
  });
}
const PR = { pull_request: { number: 7, head: { sha: "1234567abcdef" } } };

test("simulated run: vulnerable fixture fails at high, posts one comment, then updates it (no duplicate)", async () => {
  const gh = await mockGitHub();
  try {
    const env = () => ({ INPUT_PATH: "fixtures/vulnerable-app", INPUT_FAIL_ON: "high", INPUT_COMMENT: "true", INPUT_GITHUB_TOKEN: "test-token", GITHUB_API_URL: gh.url, event: PR });
    const r1 = await runAction(env());
    assert.equal(r1.code, 1, r1.stdout);
    assert.equal(gh.comments.length, 1);
    assert.match(r1.stdout, /PR comment created \(id 100\)/);
    assert.ok(gh.comments[0].body.startsWith(MARKER));
    assert.match(gh.comments[0].body, /https:\/\/github\.com\/o\/r\/blob\/1234567abcdef\/fixtures\/vulnerable-app\/supabase\/migrations\/0003_audit_log\.sql#L1/);
    assert.match(r1.summary, /## nss-security-check v[\d.]+/);
    assert.ok(+r1.outputs.findings > 20 && +r1.outputs.failing > 0 && r1.outputs["comment-id"] === "100");
    assert.match(r1.stdout, /::error file=fixtures\/vulnerable-app\/supabase\/migrations\/0001_init\.sql,line=1,title=R1 /);
    assert.equal(r1.stdout.includes("test-token"), false, "token never printed");
    const r2 = await runAction(env());
    assert.equal(r2.code, 1);
    assert.equal(gh.comments.length, 1, "deduped via hidden marker");
    assert.match(r2.stdout, /PR comment updated \(id 100\)/);
    assert.deepEqual(gh.calls.map((c) => c.method), ["GET", "POST", "GET", "PATCH"]);
    assert.ok(gh.calls.every((c) => c.auth === "Bearer test-token"));
  } finally { gh.srv.close(); }
});

test("simulated run: clean fixture passes and the comment says so; fail-on none never fails", async () => {
  const gh = await mockGitHub();
  try {
    const r = await runAction({ INPUT_PATH: "fixtures/clean-app", INPUT_GITHUB_TOKEN: "test-token", GITHUB_API_URL: gh.url, event: PR });
    assert.equal(r.code, 0, r.stdout);
    assert.match(gh.comments[0].body, /✅ No findings/);
    assert.match(r.summary, /passed/);
    const n = await runAction({ INPUT_PATH: "fixtures/vulnerable-app", INPUT_FAIL_ON: "none", INPUT_COMMENT: "false", GITHUB_API_URL: gh.url, event: PR });
    assert.equal(n.code, 0); assert.equal(gh.comments.length, 1, "comment: false posts nothing");
  } finally { gh.srv.close(); }
});

test("simulated run: fork PR (read-only token) warns but still fails on findings; push events skip the comment; bad input exits 2", async () => {
  const gh = await mockGitHub();
  try {
    const f = await runAction({ INPUT_PATH: "fixtures/vulnerable-app", INPUT_GITHUB_TOKEN: "read-only", GITHUB_API_URL: gh.url, event: PR });
    assert.equal(f.code, 1); assert.match(f.stdout, /::warning title=nss-security-check::Could not post the PR comment \(GET .* HTTP 403\)/);
    const p = await runAction({ INPUT_PATH: "fixtures/clean-app", INPUT_GITHUB_TOKEN: "test-token", GITHUB_API_URL: gh.url, event: { ref: "refs/heads/main" } });
    assert.equal(p.code, 0); assert.match(p.stdout, /Not a pull_request event/);
    assert.equal((await runAction({ INPUT_FAIL_ON: "severe" })).code, 2);
    assert.equal((await runAction({ INPUT_PATH: "nope/does-not-exist" })).code, 2);
    assert.equal(gh.comments.length, 0);
  } finally { gh.srv.close(); }
});

test("upsertComment paginates past 100 comments to find the marker", async () => {
  const pages = { 1: Array.from({ length: 100 }, (_, i) => ({ id: i, body: "other" })), 2: [{ id: 555, body: `x ${MARKER}` }] };
  const seen = [];
  const fetchImpl = async (url, o) => { seen.push(`${o.method} ${url}`); const p = +new URL(url).searchParams.get("page"); return { ok: true, json: async () => (o.method === "GET" ? pages[p] ?? [] : { id: 555 }) }; };
  const r = await upsertComment({ api: "http://x", repo: "o/r", issue: 1, token: "t", body: "b", fetchImpl });
  assert.deepEqual(r, { action: "updated", id: 555 }); assert.equal(seen.length, 3);
});

test("action.yml: Marketplace metadata, composite runtime, inputs and defaults", () => {
  const y = readFileSync(new URL("../action.yml", import.meta.url), "utf8");
  for (const re of [/^name: ".+"/m, /^description: ".{10,125}"$/m, /^branding:\n  icon: "shield"\n  color: "green"/m, /using: "composite"/, /default: \$\{\{ github\.token \}\}/, /fail-on:\n[\s\S]*?default: "high"/, /comment:\n[\s\S]*?default: "true"/, /node "\$GITHUB_ACTION_PATH\/action\/run\.mjs"/])
    assert.match(y, re);
  assert.ok(!existsSync(new URL("../action.yaml", import.meta.url)), "single metadata file");
});
