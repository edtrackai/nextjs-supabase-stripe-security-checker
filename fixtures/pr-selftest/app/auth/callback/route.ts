import { redirect } from "next/navigation";
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const next = searchParams.get("next") ?? "/";
  redirect(next);
}
