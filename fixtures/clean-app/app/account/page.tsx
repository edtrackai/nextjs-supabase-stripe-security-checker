import { redirect } from "next/navigation";
import { createUserClient } from "@/lib/supabase/server";
import { accessFor } from "@/lib/subscription";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const supabase = await createUserClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // RLS restricts this to the current user's row.
  const { data: sub } = await supabase
    .from("subscriptions")
    .select("status, current_period_end")
    .maybeSingle();

  return (
    <main>
      <h1>Account</h1>
      <p>Signed in as {user.email}</p>
      <p>Access: <strong>{accessFor(sub?.status)}</strong></p>
      {accessFor(sub?.status) === "none" ? (
        <form action="/api/checkout" method="post"><button type="submit">Subscribe</button></form>
      ) : null}
      <form action="/auth/signout" method="post"><button type="submit">Sign out</button></form>
    </main>
  );
}
