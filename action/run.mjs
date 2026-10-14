#!/usr/bin/env node
// GitHub Action entry point (called by action.yml). Scans, writes the job summary, sets outputs,
// upserts one PR comment, then exits 1 if anything is at or above fail-on.
import { appendFileSync, readFileSync, existsSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { scan } from "../lib/scan.js";
import { formatComment, formatSummary, failing, SEVERITIES } from "./format.mjs";
import { upsertComment } from "./github.mjs";

const env = process.env;
const input = (n, d = "") => (env[`INPUT_${n.toUpperCase().replace(/-/g, "_")}`] ?? env[`INPUT_${n.toUpperCase()}`] ?? "").trim() || d;
const out = (k, v) => env.GITHUB_OUTPUT && appendFileSync(env.GITHUB_OUTPUT, `${k}=${v}\n`);
const warn = (m) => console.log(`::warning title=nss-security-check::${m}`);

const failOn = input("fail-on", "high").toLowerCase();
if (failOn !== "none" && !SEVERITIES.includes(failOn)) { console.log(`::error::fail-on must be one of ${SEVERITIES.join(", ")}, none`); process.exit(2); }
const dir = resolve(env.GITHUB_WORKSPACE || ".", input("path", "."));
if (!existsSync(dir) || !statSync(dir).isDirectory()) { console.log(`::error::Not a directory: ${dir}`); process.exit(2); }

const result = scan(dir);
const fails = failing(result, failOn);
const repo = env.GITHUB_REPOSITORY, server = env.GITHUB_SERVER_URL || "https://github.com";
const sha = env.GITHUB_SHA;
let event = {};
try { if (env.GITHUB_EVENT_PATH) event = JSON.parse(readFileSync(env.GITHUB_EVENT_PATH, "utf8")); } catch {}
const pr = event.pull_request;
const headSha = pr?.head?.sha || sha;
const prefix = input("path", ".").replace(/^\.\/?/, "").replace(/\/$/, "");
const link = repo && headSha ? (f) => `${server}/${repo}/blob/${headSha}/${prefix ? prefix + "/" : ""}${f.file}#L${f.line}` : undefined;
const runUrl = repo && env.GITHUB_RUN_ID ? `${server}/${repo}/actions/runs/${env.GITHUB_RUN_ID}` : undefined;
const opts = { path: prefix || ".", failOn, link, runUrl, sha: headSha };

// stdout: JSON for logs (findings already redacted by the formatter rules where it matters)
console.log(`nss-security-check v${result.version}: ${result.findings.length} finding(s) in ${result.filesScanned} files; ${fails.length} at or above ${failOn}`);
for (const f of result.findings) console.log(`::${SEVERITIES.indexOf(f.sev) <= 1 ? "error" : "warning"} file=${prefix ? prefix + "/" : ""}${f.file},line=${f.line},title=${f.id} ${f.title.replace(/[\r\n:,]/g, " ")}::${f.fix.replace(/[\r\n]/g, " ")}`);
for (const n of result.notes ?? []) warn(n);
if (result.findings.length) console.log(`Note: GitHub shows at most 10 error and 10 warning annotations per step inline; the job summary${input("comment", "true") === "true" ? " and PR comment list" : " lists"} every finding.`);
if (env.GITHUB_STEP_SUMMARY) appendFileSync(env.GITHUB_STEP_SUMMARY, formatSummary(result, opts));
out("findings", result.findings.length); out("failing", fails.length);
for (const s of SEVERITIES) out(s, result.counts[s]);

if (input("comment", "true") === "true") {
  const token = input("github-token");
  if (!pr) console.log("Not a pull_request event: skipping the PR comment.");
  else if (!token) warn("No github-token: skipping the PR comment.");
  else {
    try {
      const r = await upsertComment({ api: env.GITHUB_API_URL || "https://api.github.com", repo, issue: pr.number, token, path: prefix || ".", body: formatComment(result, opts) });
      console.log(`PR comment ${r.action} (id ${r.id}).`); out("comment-id", r.id);
    } catch (e) {
      // Fork PRs get a read-only GITHUB_TOKEN; don't fail the scan because of that.
      warn(`Could not post the PR comment (${e.message}). Needs 'pull-requests: write'; PRs from forks get a read-only token.`);
    }
  }
}
process.exitCode = fails.length ? 1 : 0;
