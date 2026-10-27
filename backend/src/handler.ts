import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyResultV2,
  APIGatewayProxyHandlerV2,
} from "aws-lambda";
import {
  execute,
  executeVoid,
  strParam,
  longParam,
  doubleParam,
  fieldString,
  fieldLong,
  fieldDouble,
  fieldBoolean,
} from "./db.js";

type Claims = { sub: string; email?: string };

type Geo = { latitude?: number | null; longitude?: number | null };

type ClosedReason = "closed" | "out_of_candy";

const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization,content-type",
  "access-control-allow-methods": "GET,POST,DELETE,OPTIONS",
};

function json(statusCode: number, body: unknown): APIGatewayProxyResultV2 {
  return {
    statusCode,
    headers: {
      "content-type": "application/json",
      ...corsHeaders,
    },
    body: JSON.stringify(body),
  };
}

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function parseGeo(raw: Geo | undefined): { latitude: number | null; longitude: number | null } {
  const latitude =
    typeof raw?.latitude === "number" && Number.isFinite(raw.latitude) ? raw.latitude : null;
  const longitude =
    typeof raw?.longitude === "number" && Number.isFinite(raw.longitude) ? raw.longitude : null;
  if (latitude == null || longitude == null) {
    return { latitude: null, longitude: null };
  }
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    return { latitude: null, longitude: null };
  }
  return { latitude, longitude };
}

function claimsFromEvent(event: APIGatewayProxyEventV2): Claims | null {
  const authorizer = (
    event.requestContext as APIGatewayProxyEventV2["requestContext"] & {
      authorizer?: {
        jwt?: { claims?: Record<string, string | number | boolean | string[]> };
        claims?: Record<string, string | number | boolean | string[]>;
      };
    }
  ).authorizer;

  const claims = authorizer?.jwt?.claims ?? authorizer?.claims;
  if (!claims?.sub) return null;
  return {
    sub: String(claims.sub),
    email: claims.email ? String(claims.email) : undefined,
  };
}

async function ensureUser(claims: Claims): Promise<void> {
  await executeVoid(
    `INSERT INTO users (cognito_sub, email)
     VALUES (:sub, :email)
     ON CONFLICT (cognito_sub) DO UPDATE
       SET email = COALESCE(EXCLUDED.email, users.email)`,
    [strParam("sub", claims.sub), strParam("email", claims.email ?? null)],
  );
}

async function migrateIfNeeded(): Promise<void> {
  await executeVoid(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);
  await executeVoid(`
    CREATE TABLE IF NOT EXISTS users (
      cognito_sub TEXT PRIMARY KEY,
      email TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await executeVoid(`
    CREATE TABLE IF NOT EXISTS treat_counts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_sub TEXT NOT NULL REFERENCES users (cognito_sub) ON DELETE CASCADE,
      count INTEGER NOT NULL CHECK (count >= 0),
      start_at TIMESTAMPTZ,
      end_at TIMESTAMPTZ,
      recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await executeVoid(`
    CREATE INDEX IF NOT EXISTS treat_counts_user_recorded_idx
      ON treat_counts (user_sub, recorded_at DESC)
  `);
  await executeVoid(`ALTER TABLE users ADD COLUMN IF NOT EXISTS lights_on_at TIMESTAMPTZ`);
  await executeVoid(`ALTER TABLE users ADD COLUMN IF NOT EXISTS lights_off_at TIMESTAMPTZ`);
  await executeVoid(`ALTER TABLE users ADD COLUMN IF NOT EXISTS lights_on BOOLEAN NOT NULL DEFAULT false`);
  await executeVoid(`ALTER TABLE users ADD COLUMN IF NOT EXISTS closed_reason TEXT`);
  await executeVoid(`ALTER TABLE users ADD COLUMN IF NOT EXISTS house_latitude DOUBLE PRECISION`);
  await executeVoid(`ALTER TABLE users ADD COLUMN IF NOT EXISTS house_longitude DOUBLE PRECISION`);
  await executeVoid(`ALTER TABLE treat_counts ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION`);
  await executeVoid(`ALTER TABLE treat_counts ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION`);
  // Backfill boolean from prior timestamp-only rows (open if on and never closed).
  await executeVoid(`
    UPDATE users
    SET lights_on = true
    WHERE lights_on = false
      AND lights_on_at IS NOT NULL
      AND lights_off_at IS NULL
  `);
}

type CreateBody = {
  count?: number;
  startAt?: string | null;
  endAt?: string | null;
  mode?: "quick" | "range";
  latitude?: number | null;
  longitude?: number | null;
};

type HouseBody = {
  latitude?: number | null;
  longitude?: number | null;
  reason?: string | null;
};

function parseClosedReason(raw: string | null | undefined): ClosedReason {
  return raw === "out_of_candy" ? "out_of_candy" : "closed";
}

function parseBody<T>(raw: string | undefined): T {
  if (!raw) return {} as T;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return {} as T;
  }
}

async function getHouse(userSub: string) {
  const rows = await execute(
    `SELECT lights_on, lights_on_at::text, lights_off_at::text, closed_reason,
            house_latitude, house_longitude
     FROM users WHERE cognito_sub = :sub`,
    [strParam("sub", userSub)],
  );
  const r = rows[0];
  return {
    lightsOn: fieldBoolean(r?.[0]),
    lightsOnAt: fieldString(r?.[1]) ?? null,
    lightsOffAt: fieldString(r?.[2]) ?? null,
    closedReason: fieldString(r?.[3]) ?? null,
    latitude: fieldDouble(r?.[4]),
    longitude: fieldDouble(r?.[5]),
  };
}

async function setLights(
  userSub: string,
  which: "on" | "off",
  body: HouseBody,
): Promise<APIGatewayProxyResultV2> {
  const { latitude, longitude } = parseGeo(body);

  if (which === "on") {
    await executeVoid(
      `UPDATE users
       SET lights_on = true,
           lights_on_at = NOW(),
           lights_off_at = NULL,
           closed_reason = NULL,
           house_latitude = COALESCE(CAST(:lat AS double precision), house_latitude),
           house_longitude = COALESCE(CAST(:lng AS double precision), house_longitude)
       WHERE cognito_sub = :sub`,
      [
        strParam("sub", userSub),
        doubleParam("lat", latitude),
        doubleParam("lng", longitude),
      ],
    );
  } else {
    const reason = parseClosedReason(body.reason);
    await executeVoid(
      `UPDATE users
       SET lights_on = false,
           lights_off_at = NOW(),
           closed_reason = :reason,
           house_latitude = COALESCE(CAST(:lat AS double precision), house_latitude),
           house_longitude = COALESCE(CAST(:lng AS double precision), house_longitude)
       WHERE cognito_sub = :sub`,
      [
        strParam("sub", userSub),
        strParam("reason", reason),
        doubleParam("lat", latitude),
        doubleParam("lng", longitude),
      ],
    );
  }

  const house = await getHouse(userSub);
  return json(200, { house });
}

async function exportEntriesCsv(userSub: string): Promise<APIGatewayProxyResultV2> {
  // Signed-in user only. Opaque entry id; never include email.
  const house = await getHouse(userSub);
  const rows = await execute(
    `SELECT id::text, count, start_at::text, end_at::text, recorded_at::text, created_at::text,
            latitude, longitude
     FROM treat_counts
     WHERE user_sub = :sub
     ORDER BY recorded_at ASC
     LIMIT 10000`,
    [strParam("sub", userSub)],
  );

  const header = [
    "id",
    "count",
    "start_at",
    "end_at",
    "recorded_at",
    "created_at",
    "latitude",
    "longitude",
    "lights_on",
    "lights_on_at",
    "lights_off_at",
    "closed_reason",
  ];
  const lines = [header.join(",")];
  for (const r of rows) {
    lines.push(
      [
        fieldString(r[0]) ?? "",
        String(fieldLong(r[1]) ?? 0),
        fieldString(r[2]) ?? "",
        fieldString(r[3]) ?? "",
        fieldString(r[4]) ?? "",
        fieldString(r[5]) ?? "",
        fieldDouble(r[6]) == null ? "" : String(fieldDouble(r[6])),
        fieldDouble(r[7]) == null ? "" : String(fieldDouble(r[7])),
        house.lightsOn ? "true" : "false",
        house.lightsOnAt ?? "",
        house.lightsOffAt ?? "",
        house.closedReason ?? "",
      ]
        .map(csvEscape)
        .join(","),
    );
  }

  return {
    statusCode: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="treattracker-entries.csv"',
      ...corsHeaders,
    },
    body: lines.join("\n"),
  };
}

async function listEntries(userSub: string) {
  const rows = await execute(
    `SELECT id::text, count, start_at::text, end_at::text, recorded_at::text, created_at::text,
            latitude, longitude
     FROM treat_counts
     WHERE user_sub = :sub
     ORDER BY recorded_at DESC
     LIMIT 100`,
    [strParam("sub", userSub)],
  );

  const entries = rows.map((r) => ({
    id: fieldString(r[0]),
    count: fieldLong(r[1]) ?? 0,
    startAt: fieldString(r[2]),
    endAt: fieldString(r[3]),
    recordedAt: fieldString(r[4]),
    createdAt: fieldString(r[5]),
    latitude: fieldDouble(r[6]),
    longitude: fieldDouble(r[7]),
  }));

  const sumRows = await execute(
    `SELECT COALESCE(SUM(count), 0)::bigint FROM treat_counts WHERE user_sub = :sub`,
    [strParam("sub", userSub)],
  );
  const total = fieldLong(sumRows[0]?.[0]) ?? 0;
  const house = await getHouse(userSub);
  return { entries, total, house };
}

async function createEntry(userSub: string, body: CreateBody) {
  const count = Number(body.count);
  if (!Number.isFinite(count) || count < 0 || !Number.isInteger(count)) {
    return json(400, { error: "count must be a non-negative integer" });
  }

  const mode = body.mode === "range" ? "range" : "quick";
  let startAt: string | null = null;
  let endAt: string | null = null;
  const { latitude, longitude } = parseGeo(body);

  if (mode === "range") {
    if (!body.startAt || !body.endAt) {
      return json(400, { error: "startAt and endAt are required for range mode" });
    }
    const start = Date.parse(body.startAt);
    const end = Date.parse(body.endAt);
    if (Number.isNaN(start) || Number.isNaN(end)) {
      return json(400, { error: "startAt and endAt must be ISO timestamps" });
    }
    if (end < start) {
      return json(400, { error: "endAt must be after startAt" });
    }
    startAt = new Date(start).toISOString();
    endAt = new Date(end).toISOString();
  }

  const rows = await execute(
    `INSERT INTO treat_counts (user_sub, count, start_at, end_at, recorded_at, latitude, longitude)
     VALUES (
       :sub,
       :count,
       CAST(:start_at AS timestamptz),
       CAST(:end_at AS timestamptz),
       NOW(),
       CAST(:lat AS double precision),
       CAST(:lng AS double precision)
     )
     RETURNING id::text, count, start_at::text, end_at::text, recorded_at::text, created_at::text,
               latitude, longitude`,
    [
      strParam("sub", userSub),
      longParam("count", count),
      strParam("start_at", startAt),
      strParam("end_at", endAt),
      doubleParam("lat", latitude),
      doubleParam("lng", longitude),
    ],
  );

  const r = rows[0];
  return json(201, {
    entry: {
      id: fieldString(r[0]),
      count: fieldLong(r[1]) ?? count,
      startAt: fieldString(r[2]),
      endAt: fieldString(r[3]),
      recordedAt: fieldString(r[4]),
      createdAt: fieldString(r[5]),
      latitude: fieldDouble(r[6]),
      longitude: fieldDouble(r[7]),
    },
  });
}

async function deleteEntry(userSub: string, id: string) {
  const rows = await execute(
    `DELETE FROM treat_counts
     WHERE id = CAST(:id AS uuid) AND user_sub = :sub
     RETURNING id::text`,
    [strParam("id", id), strParam("sub", userSub)],
  );
  if (!rows.length) {
    return json(404, { error: "entry not found" });
  }
  return {
    statusCode: 204,
    headers: { ...corsHeaders },
  };
}

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  if (event.requestContext.http.method === "OPTIONS") {
    return json(204, {});
  }

  const claims = claimsFromEvent(event);
  if (!claims) {
    return json(401, { error: "unauthorized" });
  }

  try {
    await migrateIfNeeded();
    await ensureUser(claims);

    const method = event.requestContext.http.method;
    const path = event.rawPath.replace(/\/$/, "") || "/";

    if (method === "GET" && path === "/entries") {
      const data = await listEntries(claims.sub);
      return json(200, data);
    }

    if (method === "GET" && (path === "/export.csv" || path === "/export")) {
      return await exportEntriesCsv(claims.sub);
    }

    if (method === "POST" && path === "/house/lights-on") {
      return await setLights(claims.sub, "on", parseBody<HouseBody>(event.body));
    }

    if (method === "POST" && path === "/house/lights-off") {
      return await setLights(claims.sub, "off", parseBody<HouseBody>(event.body));
    }

    if (method === "POST" && path === "/house/out-of-candy") {
      return await setLights(claims.sub, "off", {
        ...parseBody<HouseBody>(event.body),
        reason: "out_of_candy",
      });
    }

    if (method === "POST" && path === "/entries") {
      return await createEntry(claims.sub, parseBody<CreateBody>(event.body));
    }

    const deleteMatch = path.match(/^\/entries\/([0-9a-f-]{36})$/i);
    if (method === "DELETE" && deleteMatch) {
      return await deleteEntry(claims.sub, deleteMatch[1]);
    }

    return json(404, { error: "not found" });
  } catch (err) {
    console.error("handler error", err);
    return json(500, { error: "internal error" });
  }
};
