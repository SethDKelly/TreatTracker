import { FormEvent, useState } from "react";
import { signIn, confirmSignIn, signUp } from "aws-amplify/auth";

type Props = {
  onAuthenticated: () => void;
};

export default function Login({ onAuthenticated }: Props) {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function startSignIn(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const username = email.trim().toLowerCase();
    try {
      try {
        // Password is unused — PreSignUp auto-confirms; sign-in uses EMAIL_OTP.
        await signUp({
          username,
          password: `${crypto.randomUUID()}Aa1!`,
          options: {
            userAttributes: { email: username },
          },
        });
      } catch (err) {
        const name = (err as { name?: string }).name;
        if (name !== "UsernameExistsException") {
          throw err;
        }
      }

      const result = await signIn({
        username,
        options: {
          authFlowType: "USER_AUTH",
          preferredChallenge: "EMAIL_OTP",
        },
      });

      if (result.nextStep.signInStep === "CONFIRM_SIGN_IN_WITH_EMAIL_CODE") {
        setStep("code");
        return;
      }
      if (result.isSignedIn) {
        onAuthenticated();
        return;
      }
      setError(`Unexpected sign-in step: ${result.nextStep.signInStep}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed");
    } finally {
      setBusy(false);
    }
  }

  async function confirmCode(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await confirmSignIn({ challengeResponse: code.trim() });
      if (result.isSignedIn) {
        onAuthenticated();
        return;
      }
      setError(`Unexpected confirm step: ${result.nextStep.signInStep}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid code");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel login">
      <p className="brand">TreatTracker</p>
      <h1>Track the night</h1>
      <p className="lede">Sign in with your email. We&apos;ll send a one-time code.</p>

      {step === "email" ? (
        <form onSubmit={startSignIn} className="stack">
          <label>
            Email
            <input
              type="email"
              autoComplete="email"
              inputMode="email"
              required
              value={email}
              onChange={(ev) => setEmail(ev.target.value)}
              placeholder="you@example.com"
            />
          </label>
          <button type="submit" disabled={busy}>
            {busy ? "Sending…" : "Send code"}
          </button>
        </form>
      ) : (
        <form onSubmit={confirmCode} className="stack">
          <p className="hint">Code sent to {email}</p>
          <label>
            One-time code
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              required
              value={code}
              onChange={(ev) => setCode(ev.target.value)}
              placeholder="123456"
            />
          </label>
          <button type="submit" disabled={busy}>
            {busy ? "Checking…" : "Verify"}
          </button>
          <button
            type="button"
            className="ghost"
            disabled={busy}
            onClick={() => {
              setStep("email");
              setCode("");
              setError(null);
            }}
          >
            Use a different email
          </button>
        </form>
      )}

      {error ? <p className="error" role="alert">{error}</p> : null}
    </section>
  );
}
