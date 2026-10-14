import { createClient } from "@/lib/supabase/server";
export default async function Success() {
  const supabase = await createClient();
  await supabase.from("profiles").update({ plan: "pro" }).eq("id", "me");
  return <p>Thanks!</p>;
}
