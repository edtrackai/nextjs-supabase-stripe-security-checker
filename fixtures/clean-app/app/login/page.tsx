import { sendMagicLink } from "./actions";

const errors: Record<string, string> = {
  "invalid-email": "Please enter a valid email address.",
  "send-failed": "We couldn't send the link. Please try again.",
  "link-invalid": "That sign-in link is invalid or has expired. Request a new one.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; error?: string }>;
}) {
  const { sent, error } = await searchParams;
  return (
    <main>
      <h1>Sign in</h1>
      {sent ? (
        <p role="status">Check your inbox for a sign-in link.</p>
      ) : (
        <form action={sendMagicLink}>
          <label htmlFor="email">Email</label>{" "}
          <input id="email" name="email" type="email" required autoComplete="email" />{" "}
          <button type="submit">Email me a sign-in link</button>
        </form>
      )}
      {error && errors[error] ? <p role="alert">{errors[error]}</p> : null}
    </main>
  );
}
