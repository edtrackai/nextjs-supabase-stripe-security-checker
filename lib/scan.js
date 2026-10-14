import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { spawnSync } from "node:child_process";
import { parse } from "@babel/parser";
import { CHECKS, SEVERITIES } from "./checks.js";

const SKIP = new Set(["node_modules", ".next", ".git", "dist", "build", "out", ".vercel", "coverage", ".turbo", ".cache"]);
const CODE = /\.(ts|tsx|js|jsx|mjs|cjs)$/;
const MUTATORS = new Set(["insert", "update", "upsert", "delete", "rpc"]);
const AUTH_CALLS = /^(?:(?:get|require|verify|assert|ensure|check|with)(?:Auth|User|Session|Claims|CurrentUser|Admin|Owner)\w*|auth|currentUser|getServerSession|protect)$/;
const SERVER_SECRETS = /^(SUPABASE_SERVICE_ROLE_KEY|SUPABASE_SECRET_KEY|STRIPE_SECRET_KEY|STRIPE_WEBHOOK_SECRET)$/;
const PUBLIC_OK = /(PUBLISHABLE|ANON|PUBLIC_KEY|_URL$|SITE|APP_URL|POSTHOG|GA_|SENTRY_DSN|PLAUSIBLE)/;
const SECRETISH = /(SECRET|SERVICE_ROLE|PRIVATE|PASSWORD|TOKEN|_KEY$|API_KEY)/;

function walkFiles(dir, root, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const p = join(dir, name);
    let st; try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) walkFiles(p, root, out);
    else if (st.size < 1_000_000) out.push(relative(root, p).split(sep).join("/"));
  }
  return out;
}

function parseCode(text, file) {
  try {
    return parse(text, { sourceType: "unambiguous", errorRecovery: true, plugins: ["typescript", "jsx"], sourceFilename: file });
  } catch { return null; }
}

/** Generic AST traversal with parent pointers. */
function walk(node, fn, parent = null) {
  if (!node || typeof node.type !== "string") return;
  fn(node, parent);
  for (const k of Object.keys(node)) {
    if (k === "loc" || k === "start" || k === "end" || k === "leadingComments" || k === "trailingComments") continue;
    const v = node[k];
    if (Array.isArray(v)) for (const c of v) { if (c && typeof c.type === "string") walk(c, fn, node); }
    else if (v && typeof v.type === "string") walk(v, fn, node);
  }
}

const calleeName = (c) => c?.type === "Identifier" ? c.name : c?.type === "MemberExpression" && !c.computed ? c.property.name : null;
const envName = (n) => n?.type === "MemberExpression" && n.object?.type === "MemberExpression" && n.object.object?.name === "process" && n.object.property?.name === "env" ? (n.property.name ?? n.property.value) : null;
const directives = (ast) => (ast.program.directives ?? []).map((d) => d.value.value);
const fnDirectives = (fn) => (fn.body?.directives ?? []).map((d) => d.value.value);

function containsCall(node, test) {
  let hit = false;
  walk(node, (n) => { if (!hit && (n.type === "CallExpression" || n.type === "OptionalCallExpression") && test(n)) hit = true; });
  return hit;
}
const writesData = (node) => containsCall(node, (n) => {
  const name = calleeName(n.callee);
  if (MUTATORS.has(name)) return n.callee.type === "MemberExpression";
  return false;
});
const checksAuth = (node) => containsCall(node, (n) => AUTH_CALLS.test(calleeName(n.callee) ?? ""));

/** Does this expression come from user input (params, searchParams, body, formData)? */
function fromRequest(n, tainted) {
  let hit = false;
  walk(n, (x) => {
    if (hit) return;
    if (x.type === "Identifier" && tainted.has(x.name)) hit = true;
    if (x.type === "MemberExpression" && /^(params|searchParams|query|body)$/.test(x.object?.name ?? "")) hit = true;
    if ((x.type === "CallExpression") && calleeName(x.callee) === "get" && /^(searchParams|formData|params)$/.test(x.callee.object?.name ?? x.callee.object?.property?.name ?? "")) hit = true;
  });
  return hit;
}

function exportedFunctions(ast) {
  const out = [];
  for (const s of ast.program.body) {
    const d = s.type === "ExportNamedDeclaration" ? s.declaration : s.type === "ExportDefaultDeclaration" ? s.declaration : null;
    if (!d) continue;
    if (d.type === "FunctionDeclaration") out.push({ name: d.id?.name ?? "default", fn: d });
    if (d.type === "VariableDeclaration") for (const v of d.declarations) if (/Function/.test(v.init?.type ?? "")) out.push({ name: v.id.name, fn: v.init });
  }
  return out;
}

export function scan(root, { git = true } = {}) {
  const findings = [];
  const add = (id, file, line, evidence) => findings.push({ id, sev: CHECKS[id].sev, title: CHECKS[id].title, file, line, evidence: String(evidence ?? "").trim().slice(0, 140), fix: CHECKS[id].fix });
  const files = walkFiles(root, root);
  const read = (f) => readFileSync(join(root, f), "utf8");
  const lineAt = (text, idx) => text.slice(0, idx).split("\n").length;
  const lineText = (text, line) => text.split("\n")[line - 1] ?? "";

  // ---------- env files (K2, K3)
  let tracked = new Set();
  if (git) {
    const r = spawnSync("git", ["ls-files"], { cwd: root, encoding: "utf8" });
    if (r.status === 0) tracked = new Set(r.stdout.split("\n").filter(Boolean));
  }
  for (const f of files.filter((f) => /(^|\/)\.env(\.[\w.-]+)?$/.test(f) && !/\.(example|sample|template)$/.test(f))) {
    const t = read(f);
    const hasValues = /^\s*[A-Z0-9_]+\s*=\s*\S+/m.test(t);
    if (hasValues && tracked.has(f)) add("K3", f, 1, "tracked by git");
    for (const m of t.matchAll(/^\s*(NEXT_PUBLIC_[A-Z0-9_]+)\s*=/gm)) if (SECRETISH.test(m[1]) && !PUBLIC_OK.test(m[1])) add("K2", f, lineAt(t, m.index), m[1]);
  }

  // ---------- SQL (R1-R4)
  const sqlFiles = files.filter((f) => f.endsWith(".sql")).sort();
  const sqlAll = sqlFiles.map(read).join("\n").replace(/--[^\n]*/g, "");
  for (const f of sqlFiles) {
    const t = read(f).replace(/--[^\n]*/g, (m) => " ".repeat(m.length));
    for (const m of t.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?((?:"?public"?\.)?"?(\w+)"?)/gi)) {
      const name = m[2];
      const re = new RegExp(`alter\\s+table\\s+(?:only\\s+)?(?:"?public"?\\.)?"?${name}"?\\s+enable\\s+row\\s+level\\s+security`, "i");
      if (!/^(?:"?(?:auth|storage|private|extensions)"?\.)/i.test(m[1]) && !re.test(sqlAll)) add("R1", f, lineAt(t, m.index), `table ${name}`);
    }
    for (const m of t.matchAll(/create\s+policy\s+[\s\S]*?;/gi)) {
      const p = m[0];
      const cmd = (p.match(/\bfor\s+(all|select|insert|update|delete)\b/i)?.[1] ?? "all").toLowerCase();
      const isWrite = cmd !== "select";
      if (isWrite && /\b(using|with\s+check)\s*\(\s*true\s*\)/i.test(p)) add("R2", f, lineAt(t, m.index), p.split("\n")[0]);
      if (isWrite && /\bto\s+(?:[\w\s,]*\b)?anon\b/i.test(p) || isWrite && /\bto\s+public\b/i.test(p) && /\(\s*true\s*\)/i.test(p)) add("R3", f, lineAt(t, m.index), p.split("\n")[0]);
    }
    for (const m of t.matchAll(/create\s+(?:or\s+replace\s+)?function[\s\S]*?(?:\$\$|\$\w+\$)[\s\S]*?(?:\$\$|\$\w+\$)[^;]*;/gi)) {
      const fn = m[0];
      if (/security\s+definer/i.test(fn) && !/set\s+search_path/i.test(fn)) add("R4", f, lineAt(t, m.index), fn.split("\n")[0]);
    }
  }

  // ---------- code (AST)
  let headersConfigured = false, sawNext = false;
  for (const f of files.filter((f) => CODE.test(f) && !/\.(test|spec)\.[jt]sx?$/.test(f) && !/(^|\/)(tests?|__tests__)\//.test(f))) {
    const text = read(f);
    if (/(^|\/)next\.config\.[mc]?[jt]s$/.test(f)) { sawNext = true; if (/headers\s*\(|async\s+headers/.test(text) && /(X-Frame-Options|frame-ancestors|Content-Security-Policy)/i.test(text)) headersConfigured = true; }
    if (/(^|\/)(middleware|proxy)\.[jt]s$/.test(f) && /(X-Frame-Options|frame-ancestors|Content-Security-Policy)/i.test(text)) headersConfigured = true;
    if (/(^|\/)vercel\.json$/.test(f)) continue;

    for (const m of text.matchAll(/\b(sk|rk)_live_[0-9a-zA-Z]{16,}/g)) add("K1", f, lineAt(text, m.index), m[0].slice(0, 12) + "…[redacted]");

    const ast = parseCode(text, f);
    if (!ast) continue;
    // K1 also catches keys split across string concatenation ("sk_live_" + "...")
    const fold = (n) => n.type === "StringLiteral" ? n.value : n.type === "BinaryExpression" && n.operator === "+" ? ((a, b) => a != null && b != null ? a + b : null)(fold(n.left), fold(n.right)) : null;
    walk(ast, (n, parent) => {
      if (n.type !== "BinaryExpression" || n.operator !== "+" || (parent?.type === "BinaryExpression" && parent.operator === "+")) return;
      const v = fold(n);
      if (v && /^(sk|rk)_live_[0-9a-zA-Z]{16,}$/.test(v)) add("K1", f, n.loc.start.line, v.slice(0, 12) + "…[redacted]");
    });
    const isClient = directives(ast).includes("use client");
    const isServerActionFile = directives(ast).includes("use server");
    const isRoute = /(^|\/)app\/(.*\/)?route\.[jt]sx?$/.test(f);
    const isWebhook = isRoute && /webhook/i.test(f) && /stripe/i.test(text);

    // K2 in code, K4 in client files
    walk(ast, (n) => {
      const name = envName(n);
      if (name && /^NEXT_PUBLIC_/.test(name) && SECRETISH.test(name) && !PUBLIC_OK.test(name)) add("K2", f, n.loc.start.line, name);
      if (isClient && name && SERVER_SECRETS.test(name)) add("K4", f, n.loc.start.line, `process.env.${name}`);
      if (isClient && n.type === "ImportDeclaration") {
        const src = n.source.value;
        const names = n.specifiers.map((s) => s.local.name);
        if (src === "stripe" || /supabase\/(admin|service)/.test(src) || names.some((x) => /^(createAdminClient|supabaseAdmin|createServiceClient)$/.test(x))) add("K4", f, n.loc.start.line, `import … from "${src}"`);
      }
    });

    // A1: getSession on the server
    if (!isClient) walk(ast, (n) => {
      if (n.type === "CallExpression" && n.callee.type === "MemberExpression" && n.callee.property?.name === "getSession" && n.callee.object?.type === "MemberExpression" && n.callee.object.property?.name === "auth") add("A1", f, n.loc.start.line, lineText(text, n.loc.start.line));
    });

    // A2: server actions writing without auth
    const actions = [];
    if (isServerActionFile) for (const e of exportedFunctions(ast)) actions.push(e);
    walk(ast, (n) => { if (/Function/.test(n.type) && fnDirectives(n).includes("use server") && !isServerActionFile) actions.push({ name: n.id?.name ?? "inline action", fn: n }); });
    for (const { name, fn } of actions) if (writesData(fn) && !checksAuth(fn)) add("A2", f, fn.loc.start.line, `${name}()`);

    // A3: route handlers writing without auth (webhooks/cron/auth callbacks excluded)
    if (isRoute && !isWebhook && !/(^|\/)(cron|auth)\//.test(f)) {
      for (const { name, fn } of exportedFunctions(ast)) {
        if (!/^(POST|PUT|PATCH|DELETE)$/.test(name)) continue;
        const usesSecret = /CRON_SECRET|authorization/i.test(text.slice(fn.start, fn.end));
        if (writesData(fn) && !checksAuth(fn) && !usesSecret) add("A3", f, fn.loc.start.line, `export ${name}`);
      }
    }

    // A4: admin client + .eq("id", <request value>) without a user filter in the chain
    const usesAdmin = /createAdminClient|SUPABASE_SERVICE_ROLE_KEY|SUPABASE_SECRET_KEY|supabaseAdmin/.test(text);
    if (usesAdmin) {
      const tainted = new Set();
      walk(ast, (n) => {
        if (n.type === "VariableDeclarator" && n.init && fromRequest(n.init, tainted)) {
          if (n.id.type === "Identifier") tainted.add(n.id.name);
          if (n.id.type === "ObjectPattern") for (const p of n.id.properties) if (p.value?.type === "Identifier") tainted.add(p.value.name);
        }
        if (/Function/.test(n.type)) for (const p of n.params ?? []) if (p.type === "ObjectPattern") for (const q of p.properties) if (/^(params|searchParams)$/.test(q.key?.name ?? "")) { if (q.value?.type === "Identifier") tainted.add(q.value.name); if (q.value?.type === "ObjectPattern") for (const r of q.value.properties) if (r.value?.type === "Identifier") tainted.add(r.value.name); }
      });
      walk(ast, (n) => {
        if (n.type !== "CallExpression" || calleeName(n.callee) !== "eq") return;
        const [col, val] = n.arguments;
        if (col?.type !== "StringLiteral" || !/^(id|\w+_id)$/.test(col.value) || /^(user_id|owner_id|profile_id|account_id)$/.test(col.value)) return;
        if (!val || !fromRequest(val, tainted)) return;
        // look around the call for a user filter
        const lineSrc = text.slice(Math.max(0, n.start - 400), Math.min(text.length, n.end + 400));
        if (/\.eq\(\s*["'](user_id|owner_id)["']/.test(lineSrc) || /\.match\(\s*\{[^}]*user_id/.test(lineSrc)) return;
        add("A4", f, n.loc.start.line, lineText(text, n.loc.start.line));
      });
    }

    // A5: open redirect
    walk(ast, (n) => {
      if (n.type !== "CallExpression") return;
      const nm = calleeName(n.callee);
      if (nm !== "redirect") return;
      let arg = n.arguments[0];
      if (arg?.type === "NewExpression" && arg.callee?.name === "URL") arg = arg.arguments[0];
      if (!arg) return;
      const direct = arg.type === "CallExpression" && calleeName(arg.callee) === "get" && /searchParams/.test(text.slice(arg.start, arg.end));
      let viaVar = false;
      if (arg.type === "Identifier") {
        walk(ast, (d) => { if (d.type === "VariableDeclarator" && d.id.name === arg.name && d.init && /searchParams\.get\(\s*["'](next|redirect|redirect_to|redirectTo|returnTo|return_to|url|callbackUrl)["']/.test(text.slice(d.init.start, d.init.end))) viaVar = true; });
        if (viaVar && new RegExp(`${arg.name}\\??\\.startsWith\\(\\s*["']/["']`).test(text)) viaVar = false;
      }
      if ((direct && /["'](next|redirect|redirect_to|redirectTo|returnTo|return_to|url|callbackUrl)["']/.test(text.slice(arg.start, arg.end))) || viaVar) add("A5", f, n.loc.start.line, lineText(text, n.loc.start.line));
    });

    // Stripe webhook S1-S3
    if (isWebhook) {
      if (!/constructEvent(Async)?\s*\(/.test(text)) add("S1", f, 1, "no stripe.webhooks.constructEvent");
      walk(ast, (n) => { if (n.type === "CallExpression" && calleeName(n.callee) === "json" && /^(req|request)$/.test(n.callee.object?.name ?? "") ) add("S2", f, n.loc.start.line, lineText(text, n.loc.start.line)); });
      if (/checkout\.session\.completed|customer\.subscription|invoice\./.test(text) && !/event\.id|evt\.id|\bevent_id\b|stripe_events|processed_events|idempoten/i.test(text)) add("S3", f, 1, "event.id is never recorded");
      // S6: "seen it before -> 200" with no pending/completed state: a crash or failed rollback swallows the event
      const dupe = text.search(/["']23505["']|unique_violation/);
      if (dupe >= 0 && !/["'](completed|processed|done)["']|processed_at|completed_at/.test(text)) add("S6", f, lineAt(text, dupe), lineText(text, lineAt(text, dupe)));
    }

    // S7: subscription period taken from items.data[0] (wrong for multi-item subscriptions)
    {
      const vars = new Set();
      for (const m of text.matchAll(/(?:const|let|var)\s+(\w+)\s*=\s*[\w.?]*items\.data\[0\]\s*;?/g)) vars.add(m[1]);
      const re = new RegExp(`items\\.data\\[0\\]\\??\\.current_period_(?:start|end)${vars.size ? `|\\b(?:${[...vars].join("|")})\\??\\.current_period_(?:start|end)` : ""}`, "g");
      for (const m of text.matchAll(re)) add("S7", f, lineAt(text, m.index), lineText(text, lineAt(text, m.index)));
    }

    // S4: client-chosen price/amount in checkout.sessions.create
    walk(ast, (n) => {
      if (n.type !== "CallExpression" || calleeName(n.callee) !== "create") return;
      const src = text.slice(n.callee.start, n.callee.end);
      if (!/checkout\.sessions\.create|paymentIntents\.create/.test(src)) return;
      const tainted = new Set();
      walk(ast, (d) => { if (d.type === "VariableDeclarator" && d.init && /(request|req)\.(json|formData)\(|formData\.get\(|searchParams\.get\(|\bbody\b/.test(text.slice(d.init.start, d.init.end))) { if (d.id.type === "Identifier") tainted.add(d.id.name); if (d.id.type === "ObjectPattern") for (const p of d.id.properties) if (p.value?.type === "Identifier") tainted.add(p.value.name); } });
      walk(n.arguments[0], (p) => {
        if (p.type === "ObjectProperty" && /^(price|unit_amount|amount)$/.test(p.key?.name ?? p.key?.value ?? "") && p.value.type !== "StringLiteral" && p.value.type !== "NumericLiteral" && fromRequest(p.value, tainted)) add("S4", f, p.loc.start.line, lineText(text, p.loc.start.line));
      });
    });

    // S5: grant on success page
    if (/(^|\/)app\/(.*\/)?(success|checkout\/success|thank-?you)(\/.*)?\/page\.[jt]sx?$/.test(f) && writesData(ast)) add("S5", f, 1, "writes data on the success page");

    // H2: dangerouslySetInnerHTML with non-literal
    walk(ast, (n) => {
      if (n.type !== "JSXAttribute" || n.name?.name !== "dangerouslySetInnerHTML") return;
      const html = n.value?.expression?.properties?.find((p) => (p.key?.name ?? p.key?.value) === "__html")?.value;
      if (html && !/^(StringLiteral|TemplateLiteral)$/.test(html.type) || html?.type === "TemplateLiteral" && html.expressions.length) {
        const src = text.slice(html.start, html.end);
        if (!/(sanitize|DOMPurify|purify|JSON\.stringify)/i.test(src)) add("H2", f, n.loc.start.line, lineText(text, n.loc.start.line));
      }
    });
  }
  if (sawNext && !headersConfigured) add("H1", files.find((f) => /(^|\/)next\.config\./.test(f)), 1, "no X-Frame-Options / CSP frame-ancestors");

  // de-duplicate identical hits
  const seen = new Set();
  const unique = findings.filter((x) => { const k = `${x.id}|${x.file}|${x.line}`; if (seen.has(k)) return false; seen.add(k); return true; });
  unique.sort((a, b) => SEVERITIES.indexOf(a.sev) - SEVERITIES.indexOf(b.sev) || a.file.localeCompare(b.file) || a.line - b.line);
  const counts = Object.fromEntries(SEVERITIES.map((s) => [s, unique.filter((x) => x.sev === s).length]));
  return { tool: "nss-security-check", version: JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version, root, filesScanned: files.length, counts, findings: unique };
}
