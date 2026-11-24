const ADMIN_TOKEN_KEY = "mfc_admin_token_v1";
const VIEWER_DISMISSED_KEY = "mfc_viewer_mode_v1";

export function getStoredAdminToken(): string | null {
  try {
    return window.sessionStorage.getItem(ADMIN_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setStoredAdminToken(token: string | null): void {
  try {
    if (token) {
      window.sessionStorage.setItem(ADMIN_TOKEN_KEY, token);
    } else {
      window.sessionStorage.removeItem(ADMIN_TOKEN_KEY);
    }
  } catch {
    // ignore storage errors
  }
}

export function isViewerSessionDismissed(): boolean {
  try {
    return window.sessionStorage.getItem(VIEWER_DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

export function setViewerSessionDismissed(dismissed: boolean): void {
  try {
    if (dismissed) {
      window.sessionStorage.setItem(VIEWER_DISMISSED_KEY, "1");
    } else {
      window.sessionStorage.removeItem(VIEWER_DISMISSED_KEY);
    }
  } catch {
    // ignore storage errors
  }
}

export async function checkAuthSession(): Promise<{ authenticated: boolean; username?: string }> {
  const token = getStoredAdminToken();
  try {
    const res = await fetch("/api/auth", {
      method: "GET",
      credentials: "same-origin",
      headers: {
        Accept: "application/json",
        ...(token && token !== "local-admin-ok" ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
    if (res.ok) {
      const data = (await res.json()) as {
        ok?: boolean;
        authenticated?: boolean;
        username?: string;
      };
      if (data.authenticated) {
        return { authenticated: true, username: data.username || "admin" };
      }
      setStoredAdminToken(null);
      return { authenticated: false };
    }
  } catch {
    // Local Vite dev server without Cloudflare Pages Functions
  }
  return token === "local-admin-ok"
    ? { authenticated: true, username: "admin" }
    : { authenticated: false };
}

export async function loginAdmin(
  username: string,
  password: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch("/api/auth", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    const contentType = res.headers.get("Content-Type") || "";
    if (contentType.includes("application/json")) {
      const data = (await res.json()) as {
        ok?: boolean;
        authenticated?: boolean;
        token?: string;
        error?: string;
      };
      if (res.ok && data.ok && data.authenticated) {
        if (data.token) setStoredAdminToken(data.token);
        setViewerSessionDismissed(false);
        return { ok: true };
      }
      return { ok: false, error: data.error || "Invalid username or password." };
    }
  } catch {
    // Offline or local Vite dev without Pages Functions -> check local credentials fallback
  }

  if (username.trim().toLowerCase() === "admin" && password === "mfc0000") {
    setStoredAdminToken("local-admin-ok");
    setViewerSessionDismissed(false);
    return { ok: true };
  }
  return { ok: false, error: "Invalid username or password." };
}

export async function logoutAdmin(): Promise<void> {
  setStoredAdminToken(null);
  try {
    await fetch("/api/auth", {
      method: "DELETE",
      credentials: "same-origin",
    });
  } catch {
    // Ignore network failures on logout
  }
}
