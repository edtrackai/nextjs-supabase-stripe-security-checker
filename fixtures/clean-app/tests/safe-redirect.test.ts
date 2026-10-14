import { test } from "node:test";
import assert from "node:assert/strict";
import { safeNext } from "../lib/safe-redirect";

test("allows relative paths", () => assert.equal(safeNext("/account"), "/account"));
test("blocks absolute and protocol-relative URLs", () => {
  for (const bad of ["https://evil.com", "//evil.com", "/\\evil.com", "evil", "", null, undefined])
    assert.equal(safeNext(bad), "/account");
});
