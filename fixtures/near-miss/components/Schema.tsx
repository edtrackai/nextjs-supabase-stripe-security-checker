"use client";
export function Schema({ data }: { data: object }) {
  const anon = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  return <script type="application/ld+json" data-k={anon} dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }} />;
}
