"use server";
import { createClient } from "@/lib/supabase/server";
export async function renameProject(id: string, name: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");
  await supabase.from("projects").update({ name }).eq("id", id);
}
