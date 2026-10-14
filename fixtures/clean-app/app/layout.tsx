import type { ReactNode } from "react";

export const metadata = { title: "Ship-Ready Demo", description: "Next.js + Supabase + Stripe reference app" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", maxWidth: 720, margin: "40px auto", padding: "0 20px" }}>
        {children}
      </body>
    </html>
  );
}
