import { test } from "node:test";
import assert from "node:assert/strict";
import { accessFor, entitlementItem, eventAction } from "../lib/subscription";

test("active and trialing grant access", () => {
  assert.equal(accessFor("active"), "active");
  assert.equal(accessFor("trialing"), "active");
});
test("past_due is grace", () => assert.equal(accessFor("past_due"), "grace"));
test("canceled, unknown and missing deny access", () => {
  for (const s of ["canceled", "incomplete", "unpaid", "", null, undefined]) assert.equal(accessFor(s), "none");
});

test("entitlementItem uses the only item, or the granting item on multi-item subscriptions", () => {
  assert.equal(entitlementItem([{ id: "si_1", price: { id: "price_x" } }], ["price_pro"])?.id, "si_1");
  const items = [{ id: "si_addon", price: { id: "price_addon" } }, { id: "si_plan", price: { id: "price_pro" } }];
  assert.equal(entitlementItem(items, ["price_pro"])?.id, "si_plan");
  assert.equal(entitlementItem(items, ["price_none"]), null);
});

test("eventAction skips only completed events; pending events are reprocessed", () => {
  assert.equal(eventAction("completed"), "skip");
  assert.equal(eventAction("pending"), "process");
  assert.equal(eventAction(undefined), "process");
});
