import { useCallback } from "react";
import { useNavigate } from "react-router-dom";

/**
 * Returns a stable function that merges a change into the *current* URL's
 * search params and replaces history at the same pathname. Reads
 * `window.location` directly at call time rather than react-router's
 * `location` object for two reasons:
 *
 * - Two independent writers (LocaleContext's `?lang=`, useUrlWeekSync's
 *   `?week=`) can each fire in the same tick. A value captured via
 *   `useLocation()` can still reflect the *previous* render's URL even
 *   after the other writer already called `history.replaceState` --
 *   `window.location` is the live DOM value, so whichever effect runs
 *   second always merges onto what the first one just wrote instead of
 *   clobbering it. (Caught by hand: switching language while /season's
 *   week-sync effect was mid-tick silently dropped `?lang=zh`.)
 * - An explicit `{ pathname: window.location.pathname, ... }` navigation
 *   avoids react-router's relative `"?..."` navigation, which resolves
 *   against the *nearest matched route's static path* -- for a caller
 *   mounted above `<Routes>` or inside a pathless layout route, that
 *   silently drops the actual pathname and lands on "/".
 */
export function useUrlParamWriter() {
  const navigate = useNavigate();
  return useCallback(
    (mutate: (params: URLSearchParams) => void) => {
      const params = new URLSearchParams(window.location.search);
      mutate(params);
      navigate({ pathname: window.location.pathname, search: params.toString() }, { replace: true });
    },
    [navigate],
  );
}
