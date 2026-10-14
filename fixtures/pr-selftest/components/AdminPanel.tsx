"use client";
import { createAdminClient } from "@/lib/supabase/admin";
export function AdminPanel() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const pub = process.env.NEXT_PUBLIC_STRIPE_SECRET_KEY;
  return <div>{String(Boolean(key && pub && createAdminClient))}</div>;
}
