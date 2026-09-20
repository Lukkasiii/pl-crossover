/**
 * The access token lives here -- a module-level variable, never localStorage
 * or a cookie the client can read -- so an XSS payload that can run JS still
 * has nothing to steal. It disappears on reload by design; AuthContext's
 * silent-refresh-on-mount is what makes that survivable.
 */
let accessToken: string | null = null;
const listeners = new Set<(token: string | null) => void>();

export function getAccessToken(): string | null {
  return accessToken;
}

export function setAccessToken(token: string | null): void {
  accessToken = token;
  for (const listener of listeners) listener(token);
}

export function subscribeAccessToken(listener: (token: string | null) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
