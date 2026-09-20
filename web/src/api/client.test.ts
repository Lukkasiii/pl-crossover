import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * openapi-fetch resolves `globalThis.fetch` once, at `createClient()` time
 * (see node_modules/openapi-fetch/dist/index.mjs: `fetch: baseFetch =
 * globalThis.fetch`) -- stubbing the global after `client.ts` has already
 * been imported elsewhere in the suite would silently miss it. `resetModules`
 * plus a dynamic import after the stub is what makes the mock actually land.
 */
function requestUrl(input: RequestInfo | URL): string {
  if (input instanceof Request) return input.url;
  return input.toString();
}

describe("api client 401 refresh", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  it("shares one /auth/refresh call across concurrent 401s, then retries both with the new token", async () => {
    let refreshCalls = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = requestUrl(input);

      if (url.endsWith("/auth/refresh")) {
        refreshCalls += 1;
        await new Promise((r) => setTimeout(r, 5));
        return new Response(JSON.stringify({ access_token: "new-token", token_type: "bearer", expires_in: 900 }), {
          status: 200,
        });
      }

      if (url.endsWith("/api/scenarios")) {
        const auth = input instanceof Request ? input.headers.get("Authorization") : null;
        if (auth === "Bearer new-token") return new Response("[]", { status: 200 });
        return new Response(JSON.stringify({ detail: "token is invalid or expired" }), { status: 401 });
      }

      throw new Error(`unexpected fetch to ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const { api } = await import("./client");
    const { setAccessToken } = await import("../auth/tokenStore");
    setAccessToken("stale-token");

    const [a, b] = await Promise.all([api.GET("/api/scenarios"), api.GET("/api/scenarios")]);

    expect(a.error).toBeUndefined();
    expect(b.error).toBeUndefined();
    expect(refreshCalls).toBe(1);
  });

  it("does not retry a 401 from /auth/login itself", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = requestUrl(input);
      if (url.endsWith("/auth/login")) {
        return new Response(JSON.stringify({ detail: "incorrect email or password" }), { status: 401 });
      }
      throw new Error(`unexpected fetch to ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const { api } = await import("./client");
    const { data, error } = await api.POST("/auth/login", { body: { email: "a@b.com", password: "wrong0000" } });

    expect(data).toBeUndefined();
    expect(error).toBeDefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
