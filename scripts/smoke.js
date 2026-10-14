#!/usr/bin/env node
// Smoke: vulnerable fixture must trigger every check except K3 (needs git); clean + near-miss must be empty.
import { scan } from "../lib/scan.js";
import { CHECKS } from "../lib/checks.js";
const fx = (n) => new URL(`../fixtures/${n}/`, import.meta.url).pathname;
const ids = new Set(scan(fx("vulnerable-app"), { git: false }).findings.map((f) => f.id));
const missing = Object.keys(CHECKS).filter((id) => id !== "K3" && !ids.has(id));
const fp = ["clean-app", "near-miss"].map((n) => [n, scan(fx(n), { git: false }).findings.length]);
console.log(`checks: ${Object.keys(CHECKS).length} · fired on vulnerable: ${ids.size} · false positives: ${fp.map(([n, c]) => `${n}=${c}`).join(", ")}`);
if (missing.length || fp.some(([, c]) => c)) { console.log(`FAIL ${missing.length ? "missing " + missing.join(",") : ""}`); process.exit(1); }
console.log("PASS");
