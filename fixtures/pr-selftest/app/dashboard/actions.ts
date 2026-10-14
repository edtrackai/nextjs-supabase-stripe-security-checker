"use server";
import { createClient } from "@/lib/supabase/server";
export async function deleteProject(id: string) {
  const supabase = await createClient();
  await supabase.from("projects").delete().eq("id", id);
}
export async function readOnly() {
  return 1;
}
