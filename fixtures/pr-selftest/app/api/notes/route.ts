import { createClient } from "@/lib/supabase/server";
export async function POST(request: Request) {
  const { text } = await request.json();
  const supabase = await createClient();
  await supabase.from("notes").insert({ text });
  return Response.json({ ok: true });
}
