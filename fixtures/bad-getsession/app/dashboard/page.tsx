import { createClient } from "@/lib/supabase/server";

export default async function DashboardPage() {
  const supabase = await createClient();
  // BAD: getSession does not re-validate the JWT with the Auth server
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    return <p>Please sign in</p>;
  }
  return <p>Welcome {session.user.email}</p>;
}
