#!/usr/bin/env node
/**
 * nss-security-check — free heuristic scanner for Next.js + Supabase + Stripe.
 * Usage:
 *   nss-security-check [dir] [--json]
 *   node bin/nss-security-check.js [dir] [--json]
 *
 * Always exits 0. Prints a scored report to stdout (or JSON with --json).
 */
import { resolve } from "node:path";
import { existsSync, statSync } from "node:fs";
import { scan, formatReport } from "../lib/scan.js";

const args = process.argv.slice(2);
const json = args.includes("--json");
const help = args.includes("--help") || args.includes("-h");
const positional = args.filter((a) => !a.startsWith("-"));
const target = resolve(positional[0] || ".");

if (help) {
  console.log(`Usage: nss-security-check [directory] [--json]

Scan a Next.js + Supabase + Stripe project for common AI-agent security mistakes.

Options:
  --json    Emit machine-readable JSON
  -h, --help

Exit code is always 0. Score and findings go to stdout.
`);
  process.exit(0);
}

if (!existsSync(target) || !statSync(target).isDirectory()) {
  console.error(`Not a directory: ${target}`);
  // Still exit 0 per product contract — but surface the error on stderr
  console.log(
    JSON.stringify(
      {
        error: "not_a_directory",
        target,
        score: 0,
        findings: [],
      },
      null,
      2
    )
  );
  process.exit(0);
}

const result = scan(target);
console.log(formatReport(result, { json, root: target }));
process.exit(0);
