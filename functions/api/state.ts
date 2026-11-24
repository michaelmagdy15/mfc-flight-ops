import { AuthEnv, verifyAdminRequest } from "../../server/auth";

interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(column?: string): Promise<T | null>;
  run(): Promise<{ success: boolean }>;
}

interface D1Database {
  prepare(query: string): D1PreparedStatement;
}

interface Env extends AuthEnv {
  DB?: D1Database;
}

interface PagesContext {
  request: Request;
  env: Env;
}

const STATE_KEY = "mfc_app_state_v1";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

export const onRequestGet = async (context: PagesContext): Promise<Response> => {
  const db = context.env.DB;
  if (!db) {
    return jsonResponse(
      { ok: false, mode: "local-only", error: "D1 database binding (DB) not configured." },
      503
    );
  }

  try {
    const row = await db
      .prepare("SELECT value, updated_at FROM app_state WHERE key = ?1")
      .bind(STATE_KEY)
      .first<{ value: string; updated_at: string }>();

    if (!row) {
      return jsonResponse({ ok: true, mode: "cloudflare-d1", state: null, updatedAt: null });
    }

    return jsonResponse({
      ok: true,
      mode: "cloudflare-d1",
      state: JSON.parse(row.value),
      updatedAt: row.updated_at,
    });
  } catch (err) {
    return jsonResponse(
      { ok: false, mode: "local-only", error: err instanceof Error ? err.message : "Failed to read D1 state" },
      500
    );
  }
};

export const onRequestPut = async (context: PagesContext): Promise<Response> => {
  const session = await verifyAdminRequest(context.request, context.env);
  if (!session) {
    return jsonResponse(
      {
        ok: false,
        unauthorized: true,
        error: "Admin login required to modify schedule.",
      },
      401
    );
  }

  const db = context.env.DB;
  if (!db) {
    return jsonResponse(
      { ok: false, mode: "local-only", error: "D1 database binding (DB) not configured." },
      503
    );
  }

  try {
    const payload = (await context.request.json()) as { state?: unknown };
    if (!payload || typeof payload.state !== "object" || payload.state === null) {
      return jsonResponse({ ok: false, error: "Invalid request payload: missing state object." }, 400);
    }

    const updatedAt = new Date().toISOString();
    const serialized = JSON.stringify(payload.state);

    await db
      .prepare(
        `INSERT INTO app_state (key, value, updated_at)
         VALUES (?1, ?2, ?3)
         ON CONFLICT(key) DO UPDATE SET
           value = excluded.value,
           updated_at = excluded.updated_at`
      )
      .bind(STATE_KEY, serialized, updatedAt)
      .run();

    return jsonResponse({ ok: true, mode: "cloudflare-d1", updatedAt });
  } catch (err) {
    return jsonResponse(
      { ok: false, mode: "local-only", error: err instanceof Error ? err.message : "Failed to write D1 state" },
      500
    );
  }
};
