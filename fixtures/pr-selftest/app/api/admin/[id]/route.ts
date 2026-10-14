import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("no", { status: 401 });
  const admin = createAdminClient();
  const { data } = await admin.from("invoices").select("*").eq("id", id).single();
  return Response.json(data);
}
