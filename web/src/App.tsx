import { Suspense, lazy } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./routes/AppShell";
import { useLocale } from "./i18n/LocaleContext";
import "./App.css";

// Every route lazy-loads -- Overview needs no ECharts at all, and it was
// the biggest chunk of the pre-v2 bundle sitting on the one route that
// least needed it. Season and Scenarios carry the Stage 1-4 dashboard
// unchanged; the rest are Stage 5 placeholders (see CLAUDE.md).
const Overview = lazy(() => import("./pages/Overview"));
const Season = lazy(() => import("./pages/Season"));
const Model = lazy(() => import("./pages/Model"));
const Teams = lazy(() => import("./pages/Teams"));
const TeamDetail = lazy(() => import("./pages/TeamDetail"));
const Compare = lazy(() => import("./pages/Compare"));
const Method = lazy(() => import("./pages/Method"));
const Scenarios = lazy(() => import("./pages/Scenarios"));

function RouteFallback() {
  const { t } = useLocale();
  return <p className="placeholder-note">{t("app.loadingPage")}</p>;
}

function App() {
  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<Overview />} />
          <Route path="season" element={<Season />} />
          <Route path="model" element={<Model />} />
          <Route path="teams" element={<Teams />} />
          <Route path="teams/:slug" element={<TeamDetail />} />
          <Route path="compare" element={<Compare />} />
          <Route path="method" element={<Method />} />
          <Route path="scenarios" element={<Scenarios />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </Suspense>
  );
}

export default App;
