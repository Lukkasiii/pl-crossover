import { useEffect } from "react";
import { useLocale } from "../i18n/LocaleContext";
import type { TranslationKey } from "../i18n/dictionaries";

interface PlaceholderPageProps {
  titleKey: TranslationKey;
  bodyKey: TranslationKey;
  params?: Record<string, string | number>;
  testid: string;
}

/**
 * Shared shape for every route Stage 5 wires up but doesn't fill in yet --
 * see CLAUDE.md "v2 -- multi-page dashboard / Routes". Reachable, correctly
 * routed, correct <title>, nothing more; backfilling real content here
 * belongs to that route's own stage.
 */
export function PlaceholderPage({ titleKey, bodyKey, params, testid }: PlaceholderPageProps) {
  const { t } = useLocale();
  const title = t(titleKey, params);

  useEffect(() => {
    document.title = `${title} — ${t("nav.siteTitle")}`;
  }, [title, t]);

  return (
    <section className="panel" data-testid={testid}>
      <h1>{title}</h1>
      <p>{t(bodyKey, params)}</p>
      <p className="placeholder-note">{t("placeholder.comingSoon")}</p>
    </section>
  );
}
