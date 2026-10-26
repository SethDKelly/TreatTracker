import { useCallback, useEffect, useState } from "react";
import { fetchAuthSession, getCurrentUser } from "aws-amplify/auth";
import Login from "./Login";
import Tracker from "./Tracker";

type Phase = "loading" | "signedOut" | "signedIn";

export default function App() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [email, setEmail] = useState<string | undefined>();

  const refreshSession = useCallback(async () => {
    try {
      await getCurrentUser();
      const session = await fetchAuthSession();
      const tokenEmail = session.tokens?.idToken?.payload?.email;
      setEmail(typeof tokenEmail === "string" ? tokenEmail : undefined);
      setPhase("signedIn");
    } catch {
      setEmail(undefined);
      setPhase("signedOut");
    }
  }, []);

  useEffect(() => {
    void refreshSession();
  }, [refreshSession]);

  if (phase === "loading") {
    return (
      <main className="app">
        <p className="brand">TreatTracker</p>
        <p className="hint">Loading…</p>
      </main>
    );
  }

  return (
    <main className="app">
      {phase === "signedOut" ? (
        <Login onAuthenticated={() => void refreshSession()} />
      ) : (
        <Tracker email={email} onSignedOut={() => void refreshSession()} />
      )}
    </main>
  );
}
