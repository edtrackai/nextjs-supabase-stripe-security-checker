import { createClient } from "@/lib/supabase/server";

export default async function SuccessPage({
  searchParams,
}: {
  searchParams: { session_id?: string };
}) {
  const supabase = await createClient();
  const sessionId = searchParams.session_id;
  // BAD: granting access on the success URL (replayable, no webhook)
  if (sessionId) {
    await supabase.from("profiles").update({ plan: "pro" }).eq("stripe_session", sessionId);
  }
  return <p>Thanks for your purchase!</p>;
}
