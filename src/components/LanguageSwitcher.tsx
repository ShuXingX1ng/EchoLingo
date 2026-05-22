"use client";

import { useTranslation } from "@/lib/i18n";

export default function LanguageSwitcher() {
  const { locale, setLocale, t } = useTranslation();

  return (
    <select
      value={locale}
      onChange={(e) => setLocale(e.target.value as "en" | "zh")}
      className="text-sm bg-transparent border border-slate-300 dark:border-slate-600 rounded-lg px-2 py-1.5 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-slate-500"
      aria-label={t("language.switch")}
    >
      <option value="en">{t("language.en")}</option>
      <option value="zh">{t("language.zh")}</option>
    </select>
  );
}
