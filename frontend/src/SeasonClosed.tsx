import { useEffect, useState } from "react";
import { getSeasonBounds, SEASON_TIMEZONE } from "../../shared/season";

function formatRemaining(ms: number): string {
  if (ms <= 0) return "Opening now — refresh";
  const totalSec = Math.floor(ms / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  return `${minutes}m ${seconds}s`;
}

export default function SeasonClosed() {
  const [remainingMs, setRemainingMs] = useState(() => getSeasonBounds().openAt.getTime() - Date.now());
  const openAt = getSeasonBounds().openAt;

  useEffect(() => {
    const id = window.setInterval(() => {
      const next = getSeasonBounds().openAt.getTime() - Date.now();
      setRemainingMs(next);
      if (next <= 0) {
        window.location.reload();
      }
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <section className="panel season-closed">
      <p className="brand">TreatTracker</p>
      <h1>Closed for the season</h1>
      <p className="lede">Trick-or-treat tracking opens again the week before Halloween.</p>
      <div className="countdown" aria-live="polite">
        <span className="countdown-label">Opens in</span>
        <span className="countdown-value">{formatRemaining(remainingMs)}</span>
      </div>
      <p className="subtle">
        Opens{" "}
        {openAt.toLocaleString(undefined, {
          timeZone: SEASON_TIMEZONE,
          weekday: "short",
          month: "short",
          day: "numeric",
          year: "numeric",
          hour: "numeric",
          minute: "2-digit",
          timeZoneName: "short",
        })}
      </p>
    </section>
  );
}
