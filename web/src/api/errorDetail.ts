/**
 * FastAPI's HTTPException body is `{"detail": "..."}`, but the OpenAPI spec
 * only declares the 422 validation shape (`detail` as a list) -- these routes
 * raise plain HTTPExceptions for the 401/404/409 cases, which FastAPI never
 * documents on the operation. openapi-fetch types `error` off the spec, so it
 * doesn't know that shape either; read it defensively instead of trusting it.
 */
export function errorDetail(error: unknown, fallback: string): string {
  return typeof error === "object" && error !== null && "detail" in error && typeof error.detail === "string"
    ? error.detail
    : fallback;
}
