import "server-only";
import { z } from "zod";

// Validated lazily so `next build` works without secrets; fails loudly at runtime if misconfigured.
const schema = z.object({
  NEXT_PUBLIC_SITE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  SUPABASE_SECRET_KEY: z.string().min(1),
  STRIPE_SECRET_KEY: z.string().startsWith("sk_"),
  STRIPE_WEBHOOK_SECRET: z.string().startsWith("whsec_"),
  STRIPE_PRICE_ID: z.string().startsWith("price_"),
});

let cached: z.infer<typeof schema> | undefined;
export function env() {
  cached ??= schema.parse(process.env);
  return cached;
}
