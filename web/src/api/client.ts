import createClient from "openapi-fetch";
import type { paths } from "./schema";
import { getAccessToken, setAccessToken } from "../auth/tokenStore";

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";
export const WS_BASE_URL = API_BASE_URL.replace(/^http/, "ws");

// credentials: "include" -- the API is on a different port (different origin)
// from the Vite dev server, and cross-origin fetch only sends/stores the
// httpOnly refresh cookie when the request explicitly opts in.
export const api = createClient<paths>({ baseUrl: API_BASE_URL, credentials: "include" });

const RETRIED_HEADER = "X-Auth-Retry";

// Several requests can fail on an expired access token at once (every panel
// polls independently). Without this, each would fire its own /auth/refresh,
// racing to rotate the same refresh cookie -- the loser gets a token the
// server has already invalidated. One in-flight promise, shared by whoever
// asks while it's pending, keeps refresh-then-retry a single round trip.
let refreshPromise: Promise<string | null> | null = null;

function refreshAccessToken(): Promise<string | null> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = fetch(`${API_BASE_URL}/auth/refresh`, { method: "POST", credentials: "include" })
    .then(async (res) => {
      if (!res.ok) {
        setAccessToken(null);
        return null;
      }
      const body = (await res.json()) as { access_token: string };
      setAccessToken(body.access_token);
      return body.access_token;
    })
    .catch(() => {
      setAccessToken(null);
      return null;
    })
    .finally(() => {
      refreshPromise = null;
    });

  return refreshPromise;
}

// A retried request needs its body intact, but the original's body stream is
// consumed the instant `fetch` sends it -- clone it while it's still fresh,
// in onRequest, and keep the clone around by request id until onResponse (or
// onError) either uses it or throws it away.
const pendingClones = new Map<string, Request>();

api.use({
  onRequest({ id, request }) {
    const token = getAccessToken();
    if (token) request.headers.set("Authorization", `Bearer ${token}`);
    pendingClones.set(id, request.clone());
    return request;
  },
  async onResponse({ id, request, response }) {
    const clone = pendingClones.get(id);
    pendingClones.delete(id);
    if (response.status !== 401) return response;
    // /auth/* 401s are real login/refresh failures, not an expired access
    // token on an unrelated call -- retrying would either loop or paper over
    // a wrong password as if it were a session hiccup.
    if (request.url.includes("/auth/") || request.headers.has(RETRIED_HEADER) || !clone) return response;

    const newToken = await refreshAccessToken();
    if (!newToken) return response;

    clone.headers.set("Authorization", `Bearer ${newToken}`);
    clone.headers.set(RETRIED_HEADER, "1");
    return fetch(clone);
  },
  onError({ id }) {
    pendingClones.delete(id);
  },
});
