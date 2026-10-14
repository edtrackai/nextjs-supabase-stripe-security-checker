// Pure formatting for the GitHub Action: PR comment + job summary. No I/O.
export const MARKER = "<!-- nss-security-check:pr-comment -->";
export const SEVERITIES = ["critical", "high", "medium", "low"];
const ICON = { critical: "🔴", high: "🟠", medium: "🟡", low: "🔵" };
const MAX_BODY = 60000; // GitHub's comment limit is 65,536 characters

// Belt and braces: the scanner already redacts live Stripe keys, but evidence is a raw source
// snippet, so mask anything secret-shaped before it reaches a comment or summary.
const SECRET_PATTERNS = [
  /\b(sk|rk)_(live|test)_[0-9A-Za-z]{8,}/g,
  /\bwhsec_[0-9A-Za-z]{8,}/g,
  /\bsb_secret_[0-9A-Za-z_-]{8,}/g,
  /\beyJ[0-9A-Za-z_-]{10,}\.[0-9A-Za-z_-]{10,}\.[0-9A-Za-z_-]{10,}/g, // JWTs, e.g. legacy service_role keys
  /\b(gh[pousr]_[0-9A-Za-z]{20,}|github_pat_[0-9A-Za-z_]{20,})/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /(postgres(?:ql)?:\/\/[^:\s/]+:)[^@\s]+@/g,
];
export function redact(s) {
  let out = String(s ?? "");
  for (const re of SECRET_PATTERNS) out = out.replace(re, (m, ...g) => (re.source.startsWith("(postgres") ? `${g[0]}[redacted]@` : `${m.slice(0, Math.min(8, m.length - 4))}…[redacted]`));
  return out;
}
const cell = (s) => redact(s).replace(/\|/g, "\\|").replace(/[\r\n]+/g, " ").replace(/`/g, "ˋ");

export function failing(result, failOn) {
  if (failOn === "none") return [];
  const max = SEVERITIES.indexOf(failOn);
  return result.findings.filter((f) => SEVERITIES.indexOf(f.sev) <= max);
}

export function counts(result) {
  return SEVERITIES.map((s) => `${ICON[s]} ${s} **${result.counts?.[s] ?? result.findings.filter((f) => f.sev === s).length}**`).join(" · ");
}

function table(findings, { link } = {}) {
  const rows = findings.map((f) => {
    const loc = `${f.file}:${f.line}`;
    const where = link ? `[\`${cell(loc)}\`](${link(f)})` : `\`${cell(loc)}\``;
    return `| ${ICON[f.sev]} ${f.sev} | **${f.id}** ${cell(f.title)} | ${where} | \`${cell(f.evidence)}\` |`;
  });
  return ["| Severity | Check | Location | Evidence |", "|---|---|---|---|", ...rows].join("\n");
}

/** opts: { failOn, link?: (finding) => url, runUrl?, sha? } */
export function formatComment(result, opts = {}) {
  const failOn = opts.failOn ?? "high";
  const fails = failing(result, failOn);
  const status = !result.findings.length ? "✅ No findings" : fails.length ? `❌ ${fails.length} finding(s) at or above \`${failOn}\`` : `⚠️ ${result.findings.length} finding(s), none at or above \`${failOn}\``;
  const head = [MARKER, `### nss-security-check: ${status}`, "", `${counts(result)} · ${result.filesScanned} files scanned · v${result.version}${opts.sha ? ` · \`${String(opts.sha).slice(0, 7)}\`` : ""}`, ""];
  const tail = ["", "<sub>Static heuristics, not proof of security: each hit is a prompt to review. Secrets in evidence are redacted." + (opts.runUrl ? ` [Workflow run](${opts.runUrl})` : "") + "</sub>"];
  if (!result.findings.length) return [...head, "Static checks only: this is not proof the app is secure.", ...tail].join("\n");
  let shown = result.findings.length, body;
  for (;;) {
    const list = result.findings.slice(0, shown);
    const more = result.findings.length - shown;
    const fixes = [...new Map(list.map((f) => [f.id, f])).values()].map((f) => `- **${f.id}:** ${redact(f.fix)}`).join("\n");
    body = [...head, table(list, opts), more ? `\n…and ${more} more (see the job summary or run the CLI locally).` : "", "", "<details><summary>How to fix</summary>", "", fixes, "", "</details>", ...tail].join("\n");
    if (body.length <= MAX_BODY || shown <= 1) break;
    shown = Math.max(1, Math.floor(shown * 0.7));
  }
  return body;
}

export function formatSummary(result, opts = {}) {
  const failOn = opts.failOn ?? "high";
  const fails = failing(result, failOn);
  const lines = [`## nss-security-check v${result.version}`, "", counts(result) + ` · ${result.filesScanned} files`, "", `fail-on: \`${failOn}\` → **${fails.length ? `failed (${fails.length})` : "passed"}**`, ""];
  if (result.findings.length) lines.push(table(result.findings, opts));
  else lines.push("✅ No findings. Static checks only: this is not proof the app is secure.");
  return lines.join("\n") + "\n";
}
