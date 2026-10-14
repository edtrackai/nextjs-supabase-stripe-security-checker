/** Pure mapping from a Stripe subscription status to our app's access level. Unit-tested. */
export type Access = "active" | "grace" | "none";

export function accessFor(status: string | null | undefined): Access {
  switch (status) {
    case "active":
    case "trialing":
      return "active";
    case "past_due":
      return "grace";
    default:
      return "none";
  }
}

/**
 * The subscription item that carries the entitlement. Since Stripe API 2025-03-31.basil the
 * billing period lives on each item. One item: use it. Several items: use the item whose price
 * grants access, never blindly items.data[0].
 */
export function entitlementItem<T extends { price: { id: string } }>(
  items: readonly T[],
  grantingPriceIds: readonly string[],
): T | null {
  if (items.length === 1) return items[0];
  return items.find((i) => grantingPriceIds.includes(i.price.id)) ?? null;
}

/** stripe_events status -> action. Only "completed" is skipped; "pending" is reprocessed. */
export function eventAction(status: string | null | undefined): "process" | "skip" {
  return status === "completed" ? "skip" : "process";
}
