import { useCallback, useEffect, useState } from "react";
import { fetchAuthSession, getCurrentUser } from "aws-amplify/auth";
import { isSeasonOpen } from "../../shared/season";
import Login from "./Login";
import SeasonClosed from "./SeasonClosed";
import Tracker from "./Tracker";

type Phase = "loading" | "signedOut" | "signedIn";

export default function App() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [email, setEmail] = useState<string | undefined>();
  const [seasonOpen, setSeasonOpen] = useState(() => isSeasonOpen());

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

  useEffect(() => {
    const id = window.setInterval(() => {
      setSeasonOpen(isSeasonOpen());
    }, 30_000);
    return () => window.clearInterval(id);
  }, []);

  if (!seasonOpen) {
    return (
      <main className="app">
        <SeasonClosed />
      </main>
    );
  }

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
