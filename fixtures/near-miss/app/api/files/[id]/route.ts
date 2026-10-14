import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data: { user } } = await (await createClient()).auth.getUser();
  if (!user) return new Response("no", { status: 401 });
  await createAdminClient().from("files").delete().eq("id", id).eq("user_id", user.id);
  return new Response(null, { status: 204 });
}
