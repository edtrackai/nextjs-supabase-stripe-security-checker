import { test } from "node:test";
import assert from "node:assert/strict";
import { accessFor } from "../lib/subscription";

test("active and trialing grant access", () => {
  assert.equal(accessFor("active"), "active");
  assert.equal(accessFor("trialing"), "active");
});
test("past_due is grace", () => assert.equal(accessFor("past_due"), "grace"));
test("canceled, unknown and missing deny access", () => {
  for (const s of ["canceled", "incomplete", "unpaid", "", null, undefined]) assert.equal(accessFor(s), "none");
});
