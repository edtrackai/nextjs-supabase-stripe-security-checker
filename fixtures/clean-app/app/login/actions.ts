"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { env } from "@/lib/env";
import { createUserClient } from "@/lib/supabase/server";

const schema = z.object({ email: z.email() });

export async function sendMagicLink(formData: FormData) {
  const parsed = schema.safeParse({ email: formData.get("email") });
  if (!parsed.success) redirect("/login?error=invalid-email");

  const supabase = await createUserClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data.email,
    options: { emailRedirectTo: `${env().NEXT_PUBLIC_SITE_URL}/auth/confirm?next=/account` },
  });
  if (error) redirect("/login?error=send-failed");
  redirect("/login?sent=1");
}
