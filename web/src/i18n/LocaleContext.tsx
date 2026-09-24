import { createContext, useContext, useEffect, useMemo, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { en, zh, type TranslationKey } from "./dictionaries";
import { useUrlParamWriter } from "../routing/useUrlParamWriter";

export type Locale = "en" | "zh";
const DICTIONARIES: Record<Locale, Record<TranslationKey, string>> = { en, zh };
const DEFAULT_LOCALE: Locale = "en";

interface LocaleContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
  formatNumber: (n: number, options?: Intl.NumberFormatOptions) => string;
  formatDate: (iso: string) => string;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

function parseLocale(value: string | null): Locale {
  return value === "zh" ? "zh" : DEFAULT_LOCALE;
}

/**
 * Locale lives in the URL (?lang=zh), not localStorage -- a shared link
 * must render in the language the sender saw, and a refresh must not
 * silently flip language on the visitor. See CLAUDE.md "i18n contract".
 */
export function LocaleProvider({ children }: { children: ReactNode }) {
  const [searchParams] = useSearchParams();
  const writeUrlParam = useUrlParamWriter();
  const locale = parseLocale(searchParams.get("lang"));

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const value = useMemo<LocaleContextValue>(() => {
    const dict = DICTIONARIES[locale];
    const t: LocaleContextValue["t"] = (key, params) => {
      const raw = dict[key];
      if (!params) return raw;
      return raw.replace(/\{(\w+)\}/g, (_match, name: string) => String(params[name] ?? ""));
    };
    const formatNumber = (n: number, options?: Intl.NumberFormatOptions) =>
      new Intl.NumberFormat(locale === "zh" ? "zh-CN" : "en-US", options).format(n);
    const formatDate = (iso: string) =>
      new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en-US", { dateStyle: "medium" }).format(new Date(iso));
    const setLocale = (next: Locale) => {
      writeUrlParam((params) => {
        if (next === DEFAULT_LOCALE) params.delete("lang");
        else params.set("lang", next);
      });
    };
    return { locale, setLocale, t, formatNumber, formatDate };
  }, [locale, writeUrlParam]);

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error("useLocale must be used within a LocaleProvider");
  return ctx;
}
