export default function Home() {
  return (
    <main>
      <h1>Ship-Ready Demo</h1>
      <p>Reference app for the AI rules pack: Supabase auth + RLS, Stripe Checkout and a verified webhook.</p>
      <form action="/api/checkout" method="post">
        <button type="submit">Subscribe (Stripe test mode, sign in first)</button>
      </form>
      <p><a href="/login">Sign in</a> · <a href="/account">Account</a></p>
    </main>
  );
}
