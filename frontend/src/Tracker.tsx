import { FormEvent, useEffect, useState } from "react";
import { signOut } from "aws-amplify/auth";
import {
  createEntry,
  deleteEntry,
  downloadEntriesCsv,
  getDeviceGeo,
  listEntries,
  setLightsOff,
  setLightsOn,
  setOutOfCandy,
  type Entry,
  type HouseStatus,
} from "./api";

type Props = {
  email: string | undefined;
  onSignedOut: () => void;
};

const emptyHouse: HouseStatus = {
  lightsOn: false,
  lightsOnAt: null,
  lightsOffAt: null,
  closedReason: null,
};

function toLocalInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function closedReasonLabel(reason: string | null): string {
  if (reason === "out_of_candy") return "Ran out of candy";
  if (reason === "closed") return "House closed";
  return "Lights off";
}

export default function Tracker({ email, onSignedOut }: Props) {
  const [mode, setMode] = useState<"quick" | "range">("quick");
  const [count, setCount] = useState("1");
  const [startAt, setStartAt] = useState(() => toLocalInputValue(new Date()));
  const [endAt, setEndAt] = useState(() => toLocalInputValue(new Date()));
  const [entries, setEntries] = useState<Entry[]>([]);
  const [total, setTotal] = useState(0);
  const [house, setHouse] = useState<HouseStatus>(emptyHouse);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    const data = await listEntries();
    setEntries(data.entries);
    setTotal(data.total);
    setHouse(data.house ?? emptyHouse);
  }

  useEffect(() => {
    void refresh().catch((err) => {
      setError(err instanceof Error ? err.message : "Failed to load entries");
    });
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const n = Number.parseInt(count, 10);
      if (!Number.isFinite(n) || n < 0) {
        throw new Error("Enter a valid count");
      }
      const geo = await getDeviceGeo();
      if (mode === "quick") {
        await createEntry({ count: n, mode: "quick", ...geo });
      } else {
        await createEntry({
          count: n,
          mode: "range",
          startAt: new Date(startAt).toISOString(),
          endAt: new Date(endAt).toISOString(),
          ...geo,
        });
      }
      setCount("1");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function onToggleLights() {
    setBusy(true);
    setError(null);
    try {
      const geo = await getDeviceGeo();
      const res = house.lightsOn ? await setLightsOff(geo, "closed") : await setLightsOn(geo);
      setHouse(res.house);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update lights");
    } finally {
      setBusy(false);
    }
  }

  async function onOutOfCandy() {
    setBusy(true);
    setError(null);
    try {
      const geo = await getDeviceGeo();
      const res = await setOutOfCandy(geo);
      setHouse(res.house);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update house status");
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(id: string) {
    setBusy(true);
    setError(null);
    try {
      await deleteEntry(id);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleSignOut() {
    await signOut();
    onSignedOut();
  }

  async function onDownload() {
    setBusy(true);
    setError(null);
    try {
      await downloadEntriesCsv();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Download failed");
    } finally {
      setBusy(false);
    }
  }

  const lightsOn = Boolean(house.lightsOn);

  return (
    <section className="panel tracker">
      <header className="tracker-head">
        <div>
          <p className="brand">TreatTracker</p>
          <p className="subtle">{email ?? "Signed in"}</p>
        </div>
        <div className="header-actions">
          <button type="button" className="ghost" disabled={busy} onClick={() => void onDownload()}>
            Download CSV
          </button>
          <button type="button" className="ghost" onClick={() => void handleSignOut()}>
            Sign out
          </button>
        </div>
      </header>

      <div
        className={`house-status ${lightsOn ? "on" : "off"}`}
        role="status"
        aria-live="polite"
        aria-label={lightsOn ? "Lights on" : "Lights off"}
      >
        <div className="lights-badge">
          <span className="lights-dot" aria-hidden="true" />
          <span className="lights-state">{lightsOn ? "Lights on" : "Lights off"}</span>
        </div>

        <p className="house-meta">
          {lightsOn
            ? house.lightsOnAt
              ? `Open since ${formatWhen(house.lightsOnAt)}`
              : "Open for trick-or-treaters"
            : house.lightsOffAt
              ? `${closedReasonLabel(house.closedReason)} · ${formatWhen(house.lightsOffAt)}`
              : "Not open yet"}
        </p>

        <button
          type="button"
          className={`lights-toggle ${lightsOn ? "is-on" : "is-off"}`}
          disabled={busy}
          aria-pressed={lightsOn}
          onClick={() => void onToggleLights()}
        >
          {lightsOn ? "Turn lights off" : "Turn lights on"}
        </button>

        <button
          type="button"
          className="ghost out-of-candy"
          disabled={busy || !lightsOn}
          onClick={() => void onOutOfCandy()}
        >
          Ran out of candy
        </button>
      </div>

      <div className="total-block" aria-live="polite">
        <span className="total-label">Trick-or-treaters</span>
        <span className="total-value">{total}</span>
      </div>

      <div className="mode-toggle" role="tablist" aria-label="Entry mode">
        <button
          type="button"
          role="tab"
          aria-selected={mode === "quick"}
          className={mode === "quick" ? "active" : ""}
          onClick={() => setMode("quick")}
        >
          Right now
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "range"}
          className={mode === "range" ? "active" : ""}
          onClick={() => setMode("range")}
        >
          Time range
        </button>
      </div>

      <form onSubmit={onSubmit} className="stack">
        <label>
          How many?
          <input
            type="number"
            min={0}
            step={1}
            required
            value={count}
            onChange={(ev) => setCount(ev.target.value)}
          />
        </label>

        {mode === "range" ? (
          <>
            <label>
              Start
              <input
                type="datetime-local"
                required
                value={startAt}
                onChange={(ev) => setStartAt(ev.target.value)}
              />
            </label>
            <label>
              End
              <input
                type="datetime-local"
                required
                value={endAt}
                onChange={(ev) => setEndAt(ev.target.value)}
              />
            </label>
          </>
        ) : (
          <p className="hint">Logged at the current time when you submit. Location is saved if you allow it.</p>
        )}

        <button type="submit" disabled={busy}>
          {busy ? "Saving…" : "Add entry"}
        </button>
      </form>

      {error ? <p className="error" role="alert">{error}</p> : null}

      <ul className="entry-list">
        {entries.map((entry) => (
          <li key={entry.id}>
            <div>
              <strong>{entry.count}</strong>
              <span className="subtle">
                {entry.startAt && entry.endAt
                  ? `${formatWhen(entry.startAt)} → ${formatWhen(entry.endAt)}`
                  : formatWhen(entry.recordedAt)}
              </span>
            </div>
            <button
              type="button"
              className="ghost danger"
              disabled={busy}
              onClick={() => void onDelete(entry.id)}
              aria-label={`Delete entry of ${entry.count}`}
            >
              Remove
            </button>
          </li>
        ))}
        {!entries.length ? <li className="empty">No entries yet tonight.</li> : null}
      </ul>
    </section>
  );
}
