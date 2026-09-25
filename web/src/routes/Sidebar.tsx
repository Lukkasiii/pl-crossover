import { useState } from "react";
import { NavLink } from "react-router-dom";
import { AuthPanel } from "../components/auth/AuthPanel";
import { useLocale } from "../i18n/LocaleContext";
import type { TranslationKey } from "../i18n/dictionaries";
import "./Sidebar.css";

interface NavItem {
  to: string;
  labelKey: TranslationKey;
  end: boolean;
  testid: string;
}

const NAV_ITEMS: NavItem[] = [
  { to: "/overview", labelKey: "nav.overview", end: false, testid: "nav-overview" },
  { to: "/season", labelKey: "nav.season", end: false, testid: "nav-season" },
  { to: "/model", labelKey: "nav.model", end: false, testid: "nav-model" },
  { to: "/teams", labelKey: "nav.teams", end: false, testid: "nav-teams" },
  { to: "/compare", labelKey: "nav.compare", end: false, testid: "nav-compare" },
  { to: "/method", labelKey: "nav.method", end: false, testid: "nav-method" },
  { to: "/scenarios", labelKey: "nav.scenarios", end: false, testid: "nav-scenarios" },
];

/**
 * Two visible states share one <nav>: a permanent left column at desktop
 * widths, a full-screen drawer toggled from a fixed-position button at
 * narrow widths (see Sidebar.css). The toggle sits outside the drawer's own
 * stacking context so it stays reachable to close the drawer, not just open
 * it. `open` only matters below the CSS breakpoint; desktop ignores it.
 */
export function Sidebar() {
  const { t, locale, setLocale } = useLocale();
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="sidebar-topbar">
        <NavLink to="/" className="sidebar-title" onClick={() => setOpen(false)}>
          {t("nav.siteTitle")}
        </NavLink>
      </div>

      <button
        type="button"
        className="sidebar-toggle"
        aria-expanded={open}
        aria-controls="sidebar-nav"
        aria-label={t("nav.toggleSidebar")}
        data-testid="sidebar-toggle"
        onClick={() => setOpen((v) => !v)}
      >
        <span aria-hidden="true">{open ? "✕" : "☰"}</span>
      </button>

      <nav
        id="sidebar-nav"
        className={`sidebar${open ? " sidebar-open" : ""}`}
        aria-label={t("nav.siteTitle")}
        data-testid="sidebar-nav"
      >
        <span className="sidebar-title sidebar-title-desktop">{t("nav.siteTitle")}</span>

        <ul className="sidebar-list">
          {NAV_ITEMS.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                end={item.end}
                className={({ isActive }) => `sidebar-link${isActive ? " sidebar-link-active" : ""}`}
                data-testid={item.testid}
                onClick={() => setOpen(false)}
              >
                {t(item.labelKey)}
              </NavLink>
            </li>
          ))}
        </ul>

        <div className="sidebar-footer">
          <div className="locale-switcher" role="group" aria-label={t("nav.langSwitcher")}>
            <button
              type="button"
              aria-pressed={locale === "en"}
              onClick={() => setLocale("en")}
              data-testid="locale-en"
            >
              EN
            </button>
            <button
              type="button"
              aria-pressed={locale === "zh"}
              onClick={() => setLocale("zh")}
              data-testid="locale-zh"
            >
              中文
            </button>
          </div>
          <a
            className="sidebar-repo-link"
            href="https://github.com/Lukkasiii/pl-crossover"
            target="_blank"
            rel="noopener noreferrer"
          >
            {t("app.repoLink")} ↗
          </a>
          <AuthPanel />
        </div>
      </nav>
    </>
  );
}
