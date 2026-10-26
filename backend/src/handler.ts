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
  fieldString,
  fieldLong,
} from "./db.js";

type Claims = { sub: string; email?: string };

function json(statusCode: number, body: unknown): APIGatewayProxyResultV2 {
  return {
    statusCode,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "authorization,content-type",
      "access-control-allow-methods": "GET,POST,DELETE,OPTIONS",
    },
    body: JSON.stringify(body),
  };
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
}

type CreateBody = {
  count?: number;
  startAt?: string | null;
  endAt?: string | null;
  mode?: "quick" | "range";
};

function parseBody(raw: string | undefined): CreateBody {
  if (!raw) return {};
  try {
    return JSON.parse(raw) as CreateBody;
  } catch {
    return {};
  }
}

async function listEntries(userSub: string) {
  const rows = await execute(
    `SELECT id::text, count, start_at::text, end_at::text, recorded_at::text, created_at::text
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
  }));

  const sumRows = await execute(
    `SELECT COALESCE(SUM(count), 0)::bigint FROM treat_counts WHERE user_sub = :sub`,
    [strParam("sub", userSub)],
  );
  const total = fieldLong(sumRows[0]?.[0]) ?? 0;
  return { entries, total };
}

async function createEntry(userSub: string, body: CreateBody) {
  const count = Number(body.count);
  if (!Number.isFinite(count) || count < 0 || !Number.isInteger(count)) {
    return json(400, { error: "count must be a non-negative integer" });
  }

  const mode = body.mode === "range" ? "range" : "quick";
  let startAt: string | null = null;
  let endAt: string | null = null;

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
    `INSERT INTO treat_counts (user_sub, count, start_at, end_at, recorded_at)
     VALUES (
       :sub,
       :count,
       CAST(:start_at AS timestamptz),
       CAST(:end_at AS timestamptz),
       NOW()
     )
     RETURNING id::text, count, start_at::text, end_at::text, recorded_at::text, created_at::text`,
    [
      strParam("sub", userSub),
      longParam("count", count),
      strParam("start_at", startAt),
      strParam("end_at", endAt),
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
    headers: {
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "authorization,content-type",
      "access-control-allow-methods": "GET,POST,DELETE,OPTIONS",
    },
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

    if (method === "POST" && path === "/entries") {
      return await createEntry(claims.sub, parseBody(event.body));
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
