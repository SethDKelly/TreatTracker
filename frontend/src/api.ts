import { fetchAuthSession } from "aws-amplify/auth";

const apiUrl = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "");

export type Entry = {
  id: string;
  count: number;
  startAt: string | null;
  endAt: string | null;
  recordedAt: string;
  createdAt: string;
};

export type EntriesResponse = {
  entries: Entry[];
  total: number;
};

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
}): Promise<{ entry: Entry }> {
  return request<{ entry: Entry }>("/entries", {
    method: "POST",
    body: JSON.stringify(body),
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
