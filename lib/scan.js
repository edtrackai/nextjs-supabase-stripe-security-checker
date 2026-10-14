import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import {
  CHECKS,
  SEV_WEIGHT,
  SKIP_DIRS,
  CODE_RE,
  SQL_RE,
  isTrustedServerPath,
  isClientFile,
  hasServerOnlyImport,
  lineOf,
  snippetAt,
} from "./checks.js";

function walk(dir, root, out = []) {
  let names;
  try {
    names = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of names) {
    if (SKIP_DIRS.has(name)) continue;
    const p = join(dir, name);
    let st;
    try {
      st = statSync(p);
    } catch {
      continue;
    }
    if (st.isDirectory()) walk(p, root, out);
    else if (st.isFile() && st.size < 1_000_000) {
      out.push(relative(root, p).split(sep).join("/"));
    }
  }
  return out;
}

function add(findings, id, file, line, text, note) {
  const meta = CHECKS[id];
  findings.push({
    id,
    severity: meta.sev,
    title: meta.title,
    file,
    line,
    evidence: text ? snippetAt(text, line) : "",
    note: note || meta.fix,
  });
}

/**
 * Scan a project root. Returns { findings, score, summary }.
 */
export function scan(root) {
  const findings = [];
  const files = walk(root, root);

  for (const f of files) {
    const isCode = CODE_RE.test(f);
    const isSql = SQL_RE.test(f);
    if (!isCode && !isSql) continue;

    let t;
    try {
      t = readFileSync(join(root, f), "utf8");
    } catch {
      continue;
    }
    if (!t) continue;

    if (isCode) {
      const client = isClientFile(t);
      const trusted = isTrustedServerPath(f);
      const serverOnly = hasServerOnlyImport(t);

      // SR1: service-role / SUPABASE_SERVICE_ROLE outside trusted + server-only context
      const srRe =
        /SUPABASE_SERVICE_ROLE(_KEY)?|createClient\s*\([^)]*service[_-]?role|createAdminClient\s*\(|serviceRoleKey|SERVICE_ROLE_KEY/gi;
      let m;
      const srLocal = new RegExp(srRe.source, "gi");
      while ((m = srLocal.exec(t)) !== null) {
        const ok =
          trusted ||
          (serverOnly && !client) ||
          /(^|\/)(app\/api\/|actions\/)/.test(f);
        // Flag client files always; flag other paths unless clearly server-only trusted
        if (client || !ok) {
          add(
            findings,
            "SR1",
            f,
            lineOf(t, m.index),
            t,
            client
              ? "Found in a \"use client\" file — this will ship to browsers."
              : CHECKS.SR1.fix
          );
        }
      }

      // GS1: getSession(
      const gsLocal = /(?:\.|\b)getSession\s*\(/g;
      while ((m = gsLocal.exec(t)) !== null) {
        // Skip obvious non-auth usages like sessionStorage.getSession if any — keep simple: flag auth.getSession and bare getSession in supabase context
        const before = t.slice(Math.max(0, m.index - 40), m.index);
        if (/sessionStorage|localStorage|cookieStore/i.test(before)) continue;
        add(findings, "GS1", f, lineOf(t, m.index), t);
      }

      // SW1: Stripe webhook without constructEvent + raw body
      const looksWebhook =
        /webhook/i.test(f) &&
        /route\.(ts|js|mjs|cjs)$/.test(f) &&
        /stripe/i.test(t);
      if (looksWebhook) {
        const hasConstruct = /constructEvent(Async)?\s*\(/.test(t);
        const hasRawBody =
          /\.text\s*\(|rawBody|raw-body|buffer\s*\(|asRawBody|req\.body\b/.test(
            t
          ) && !/(request|req)\.json\s*\(/.test(t);
        // Also flag if constructEvent exists but request.json() appears before it
        const jsonIdx = t.search(/(request|req)\.json\s*\(/);
        const constructIdx = t.search(/constructEvent(Async)?\s*\(/);
        if (!hasConstruct) {
          add(
            findings,
            "SW1",
            f,
            1,
            t,
            "No constructEvent found. Verify the Stripe signature on the raw body."
          );
        } else if (jsonIdx >= 0 && (constructIdx < 0 || jsonIdx < constructIdx)) {
          add(
            findings,
            "SW1",
            f,
            lineOf(t, jsonIdx),
            t,
            "request.json() appears before (or without) a raw-body + constructEvent pattern."
          );
        } else if (!hasRawBody && hasConstruct) {
          // constructEvent present but no obvious raw body — soft note via same id
          const idx = constructIdx >= 0 ? constructIdx : 0;
          add(
            findings,
            "SW1",
            f,
            lineOf(t, idx),
            t,
            "constructEvent found but no obvious raw-body read (.text()). Confirm you are not passing a parsed object."
          );
        }
      }

      // S5: grant/access on success page
      const looksSuccess =
        /(success|thank[-_]?you|checkout[-_]?complete)/i.test(f) ||
        (/success|thank/i.test(f) && /page\.(tsx|jsx|ts|js)$/.test(f));
      if (looksSuccess) {
        const grants =
          /\.(update|upsert|insert)\s*\(/.test(t) ||
          /\b(grant|entitle|activate|setPro|setPlan|markPaid|fulfill)\w*\s*\(/.test(
            t
          );
        const checkoutContext =
          /(checkout\.sessions\.retrieve|session_id|sessionId|stripe)/i.test(t);
        if (grants && checkoutContext) {
          const idx = t.search(/\.(update|upsert|insert)\s*\(/);
          const idx2 = t.search(
            /\b(grant|entitle|activate|setPro|setPlan|markPaid|fulfill)\w*\s*\(/
          );
          const use = idx >= 0 ? idx : idx2 >= 0 ? idx2 : 0;
          add(findings, "S5", f, lineOf(t, use), t);
        }
      }
    }

    if (isSql) {
      // Strip SQL line comments for matching
      const sql = t.replace(/--[^\n]*/g, (c) => " ".repeat(c.length));
      // using (true) / with check (true)
      const truePolicy =
        /(?:using|with\s+check)\s*\(\s*true\s*\)|qual\s*=\s*'true'|with_check\s*=\s*'true'/gi;
      let m;
      while ((m = truePolicy.exec(sql)) !== null) {
        add(findings, "R2", f, lineOf(t, m.index), t);
      }
    }
  }

  // Dedupe identical id+file+line (e.g. using(true)+with check(true) on one line)
  const seen = new Set();
  const unique = [];
  for (const f of findings) {
    const k = `${f.id}|${f.file}|${f.line}`;
    if (seen.has(k)) continue;
    seen.add(k);
    unique.push(f);
  }
  findings.length = 0;
  findings.push(...unique);

  // Score
  let score = 100;
  const bySev = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  for (const f of findings) {
    bySev[f.severity] = (bySev[f.severity] || 0) + 1;
    score -= SEV_WEIGHT[f.severity] ?? 0;
  }
  if (score < 0) score = 0;

  return {
    findings,
    score,
    summary: {
      filesScanned: files.filter((f) => CODE_RE.test(f) || SQL_RE.test(f))
        .length,
      findingCount: findings.length,
      bySeverity: bySev,
    },
  };
}

export function formatReport(result, { json = false, root = "." } = {}) {
  if (json) {
    return JSON.stringify(
      {
        tool: "nextjs-supabase-stripe-security-checker",
        version: "0.1.0",
        root,
        score: result.score,
        summary: result.summary,
        findings: result.findings,
        checks: Object.values(CHECKS).map(({ id, sev, title, why, fix }) => ({
          id,
          severity: sev,
          title,
          why,
          fix,
        })),
      },
      null,
      2
    );
  }

  const lines = [];
  lines.push("Next.js + Supabase + Stripe security checker (free / heuristic)");
  lines.push(`Root: ${root}`);
  lines.push(
    `Score: ${result.score}/100  |  Findings: ${result.summary.findingCount}  |  Files scanned: ${result.summary.filesScanned}`
  );
  lines.push(
    `By severity: critical=${result.summary.bySeverity.critical} high=${result.summary.bySeverity.high} medium=${result.summary.bySeverity.medium} low=${result.summary.bySeverity.low}`
  );
  lines.push("");

  if (result.findings.length === 0) {
    lines.push("No heuristic hits. This is NOT a clean bill of health — see README limits.");
  } else {
    for (const f of result.findings) {
      lines.push(`[${f.severity.toUpperCase()}] ${f.id} ${f.title}`);
      lines.push(`  at ${f.file}:${f.line}`);
      if (f.evidence) lines.push(`  evidence: ${f.evidence}`);
      if (f.note) lines.push(`  fix: ${f.note}`);
      lines.push("");
    }
  }

  lines.push("---");
  lines.push(
    "Always exit 0. Heuristics only. For a deeper pre-launch audit: https://luxurydrive0.gumroad.com/l/security-checklist"
  );
  return lines.join("\n");
}
