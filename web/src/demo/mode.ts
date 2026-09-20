/**
 * Set at build time (`npm run build:demo`, see .env.demo) so the deployed
 * static demo never tries to open a WebSocket that isn't there. Checked
 * once per module load, not per render -- it never changes at runtime.
 */
export const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === "true";
