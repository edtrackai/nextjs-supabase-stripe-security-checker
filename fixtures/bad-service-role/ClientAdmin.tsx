"use client";

import { createClient } from "@supabase/supabase-js";

// BAD: service-role key in a client component — ships to the browser
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export function ClientAdmin() {
  return <button onClick={() => supabase.from("users").select("*")}>Load all</button>;
}
