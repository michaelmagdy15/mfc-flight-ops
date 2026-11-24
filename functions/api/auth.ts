import {
  AuthEnv,
  buildSessionCookie,
  createAdminToken,
  validateAdminCredentials,
  verifyAdminRequest,
} from "../../server/auth";

interface PagesContext {
  request: Request;
  env: AuthEnv;
}

function jsonResponse(body: unknown, status = 200, extraHeaders?: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...extraHeaders,
    },
  });
}

export const onRequestGet = async (context: PagesContext): Promise<Response> => {
  const session = await verifyAdminRequest(context.request, context.env);
  if (!session) {
    return jsonResponse({ ok: true, authenticated: false });
  }
  return jsonResponse({
    ok: true,
    authenticated: true,
    username: session.username,
    role: session.role,
  });
};

export const onRequestPost = async (context: PagesContext): Promise<Response> => {
  try {
    const body = (await context.request.json()) as {
      username?: string;
      password?: string;
    };
    const username = typeof body?.username === "string" ? body.username : "";
    const password = typeof body?.password === "string" ? body.password : "";

    if (!validateAdminCredentials(username, password, context.env)) {
      return jsonResponse(
        { ok: false, authenticated: false, error: "Invalid username or password." },
        401
      );
    }

    const canonicalUsername = (context.env.ADMIN_USERNAME || "admin").trim();
    const token = await createAdminToken(canonicalUsername, context.env);
    const cookie = buildSessionCookie(token, context.request.url, false);

    return jsonResponse(
      {
        ok: true,
        authenticated: true,
        username: canonicalUsername,
        role: "admin",
        token,
      },
      200,
      { "Set-Cookie": cookie }
    );
  } catch {
    return jsonResponse(
      { ok: false, authenticated: false, error: "Invalid login payload." },
      400
    );
  }
};

export const onRequestDelete = async (context: PagesContext): Promise<Response> => {
  const clearCookie = buildSessionCookie("", context.request.url, true);
  return jsonResponse(
    { ok: true, authenticated: false },
    200,
    { "Set-Cookie": clearCookie }
  );
};
