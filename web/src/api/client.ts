import createClient from "openapi-fetch";
import type { paths } from "./schema";

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";
export const WS_BASE_URL = API_BASE_URL.replace(/^http/, "ws");

export const api = createClient<paths>({ baseUrl: API_BASE_URL });
