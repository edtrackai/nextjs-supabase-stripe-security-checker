import { redirect } from "next/navigation";
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const raw = searchParams.get("next") ?? "/";
  const next = raw.startsWith("/") && !raw.startsWith("//") ? raw : "/";
  redirect(next);
}
