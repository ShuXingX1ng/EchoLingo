"use client";

import { useTranslation } from "@/lib/i18n";

export default function LanguageSwitcher() {
  const { locale, setLocale, t } = useTranslation();

  return (
    <select
      value={locale}
      onChange={(e) => setLocale(e.target.value as "en" | "zh")}
      className="text-sm bg-transparent border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1.5 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500"
      aria-label={t("language.switch")}
    >
      <option value="en">{t("language.en")}</option>
      <option value="zh">{t("language.zh")}</option>
    </select>
  );
}
