#!/usr/bin/env node
/**
 * Smoke: run the CLI against fixtures/ and require at least one finding per known check family.
 * Prints PASS or FAIL. Exit 0 on PASS (and on FAIL we still exit 0 from the CLI contract for the scanner,
 * but this smoke script exits 1 on FAIL so CI can catch it).
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const bin = join(root, "bin", "nss-security-check.js");
const fixtures = join(root, "fixtures");

const r = spawnSync(process.execPath, [bin, fixtures, "--json"], {
  encoding: "utf8",
});

if (r.error) {
  console.error("FAIL: could not spawn CLI", r.error);
  process.exit(1);
}

let data;
try {
  data = JSON.parse(r.stdout);
} catch (e) {
  console.error("FAIL: CLI did not emit JSON\n", r.stdout, r.stderr);
  process.exit(1);
}

const ids = new Set((data.findings || []).map((f) => f.id));
const required = ["SR1", "GS1", "SW1", "S5", "R2"];
const missing = required.filter((id) => !ids.has(id));

console.log("--- smoke report ---");
console.log(`score=${data.score} findings=${data.findings?.length ?? 0}`);
console.log(`ids found: ${[...ids].sort().join(", ") || "(none)"}`);
if (missing.length) {
  console.log(`FAIL: missing expected check ids: ${missing.join(", ")}`);
  process.exit(1);
}
console.log("PASS");
process.exit(0);
