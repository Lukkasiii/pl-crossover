import { DEMO_MODE } from "../demo/mode";
import { useDemoReplay } from "../demo/useDemoReplay";
import { useReplaySocket } from "./useReplaySocket";

/**
 * DEMO_MODE is a build-time constant (never flips at runtime for a given
 * build), so branching which hook runs doesn't break the rules of hooks --
 * a given build always takes the same branch, every render.
 */
export function useReplay(pairId: number) {
  if (DEMO_MODE) {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    return useDemoReplay(pairId);
  }
  // eslint-disable-next-line react-hooks/rules-of-hooks
  return useReplaySocket(pairId);
}
