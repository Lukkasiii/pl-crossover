import { Outlet } from "react-router-dom";
import { ReplaySessionProvider } from "../state/ReplaySessionContext";

/**
 * Shared ancestor for /season and /model: mounts once when either route is
 * entered and stays mounted while navigating between the two, so the live
 * replay connection they both read from survives the switch. See
 * ReplaySessionContext for why that persistence is the point.
 */
export function ReplaySessionLayout() {
  return (
    <ReplaySessionProvider>
      <Outlet />
    </ReplaySessionProvider>
  );
}
