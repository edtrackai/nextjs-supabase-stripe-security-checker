import "server-only";
import Stripe from "stripe";
import { env } from "./env";

let client: Stripe | undefined;
export function stripe() {
  client ??= new Stripe(env().STRIPE_SECRET_KEY);
  return client;
}
