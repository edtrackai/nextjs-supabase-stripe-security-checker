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
