import { fetchAuthSession } from "aws-amplify/auth";

const apiUrl = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "");

export type Geo = {
  latitude?: number | null;
  longitude?: number | null;
};

export type Entry = {
  id: string;
  count: number;
  startAt: string | null;
  endAt: string | null;
  recordedAt: string;
  createdAt: string;
  latitude?: number | null;
  longitude?: number | null;
};

export type HouseStatus = {
  lightsOnAt: string | null;
  lightsOffAt: string | null;
  latitude?: number | null;
  longitude?: number | null;
};

export type EntriesResponse = {
  entries: Entry[];
  total: number;
  house: HouseStatus;
};

/** Best-effort device location; returns empty if denied, unavailable, or timed out. */
export function getDeviceGeo(timeoutMs = 4000): Promise<Geo> {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return Promise.resolve({});
  }
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        });
      },
      () => resolve({}),
      { enableHighAccuracy: false, timeout: timeoutMs, maximumAge: 60_000 },
    );
  });
}

async function authHeaders(): Promise<HeadersInit> {
  const session = await fetchAuthSession();
  const token = session.tokens?.accessToken?.toString();
  if (!token) {
    throw new Error("Not signed in");
  }
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  if (!apiUrl) {
    throw new Error("VITE_API_URL is not configured");
  }
  const headers = await authHeaders();
  const res = await fetch(`${apiUrl}${path}`, {
    ...init,
    headers: { ...headers, ...(init?.headers ?? {}) },
  });
  if (res.status === 204) {
    return undefined as T;
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || `Request failed (${res.status})`);
  }
  return data as T;
}

export function listEntries(): Promise<EntriesResponse> {
  return request<EntriesResponse>("/entries");
}

export function createEntry(body: {
  count: number;
  mode: "quick" | "range";
  startAt?: string;
  endAt?: string;
  latitude?: number | null;
  longitude?: number | null;
}): Promise<{ entry: Entry }> {
  return request<{ entry: Entry }>("/entries", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function setLightsOn(geo: Geo = {}): Promise<{ house: HouseStatus }> {
  return request<{ house: HouseStatus }>("/house/lights-on", {
    method: "POST",
    body: JSON.stringify(geo),
  });
}

export function setLightsOff(geo: Geo = {}): Promise<{ house: HouseStatus }> {
  return request<{ house: HouseStatus }>("/house/lights-off", {
    method: "POST",
    body: JSON.stringify(geo),
  });
}

export function deleteEntry(id: string): Promise<void> {
  return request<void>(`/entries/${id}`, { method: "DELETE" });
}

export async function downloadEntriesCsv(): Promise<void> {
  if (!apiUrl) {
    throw new Error("VITE_API_URL is not configured");
  }
  const headers = await authHeaders();
  const res = await fetch(`${apiUrl}/export.csv`, { headers });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as { error?: string }).error || `Download failed (${res.status})`);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "treattracker-entries.csv";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
