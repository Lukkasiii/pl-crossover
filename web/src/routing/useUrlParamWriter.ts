import { useCallback } from "react";
import { useNavigate } from "react-router-dom";

// Vite's BASE_URL is "/" for the Docker-served build, "/pl-crossover/" for
// the GitHub Pages demo build (see vite.config.ts). Always a build-time
// constant, safe to compute once at module scope.
const BASENAME = import.meta.env.BASE_URL;

/**
 * `window.location.pathname` is the *full* browser path, basename included
 * (e.g. "/pl-crossover/season"). `<BrowserRouter basename={BASENAME}>`
 * expects navigate()'s `pathname` *without* it -- it prepends the basename
 * itself. Handing it the full path double-prepends: "/pl-crossover/season"
 * navigates to "/pl-crossover/pl-crossover/season", which matches no route
 * and falls through to the `*` -> `<Navigate to="/">` catch-all. On the dev
 * server BASENAME is "/", stripping is a no-op, and the bug is invisible --
 * it only bites the deployed build, which is why nothing local caught it
 * (see e2e/production-base.spec.ts, which builds and serves under the real
 * base to catch exactly this).
 */
function stripBasename(pathname: string): string {
  if (BASENAME === "/" || BASENAME === "") return pathname;
  const trimmed = BASENAME.endsWith("/") ? BASENAME.slice(0, -1) : BASENAME;
  if (!pathname.startsWith(trimmed)) return pathname;
  return pathname.slice(trimmed.length) || "/";
}

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
 * - An explicit `{ pathname, ... }` navigation avoids react-router's
 *   relative `"?..."` navigation, which resolves against the *nearest
 *   matched route's static path* -- for a caller mounted above `<Routes>`
 *   or inside a pathless layout route, that silently drops the actual
 *   pathname and lands on "/". The pathname itself still has to be
 *   basename-stripped (see stripBasename) or the same class of bug comes
 *   back under a basename other than "/".
 */
export function useUrlParamWriter() {
  const navigate = useNavigate();
  return useCallback(
    (mutate: (params: URLSearchParams) => void) => {
      const params = new URLSearchParams(window.location.search);
      mutate(params);
      navigate({ pathname: stripBasename(window.location.pathname), search: params.toString() }, { replace: true });
    },
    [navigate],
  );
}
