"use client";

import Link from "next/link";
import MuteButton from "@/components/MuteButton";
import UserMenu from "@/components/UserMenu";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import LearningPath from "@/components/LearningPath";
import { useTranslation } from "@/lib/i18n";

export default function Home() {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col min-h-screen bg-gradient-to-b from-blue-50 to-white dark:from-gray-900 dark:to-gray-950">
      {/* Navigation */}
      <nav className="w-full px-6 py-4" aria-label="Main navigation">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <Link href="/" className="text-lg font-bold text-gray-900 dark:text-white">
            EchoLingo
          </Link>
          <div className="flex items-center gap-4">
            <MuteButton />
            <LanguageSwitcher />
            <UserMenu />
            <Link
              href="/practice"
              className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
            >
              {t("nav.practice")}
            </Link>
            <Link
              href="/history"
              className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
            >
              {t("nav.history")}
            </Link>
            <Link
              href="/stats"
              className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
            >
              {t("nav.stats")}
            </Link>
            <Link
              href="/settings"
              className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
            >
              {t("nav.settings")}
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <main id="main-content" className="flex-1 flex items-center justify-center px-6 py-16">
        <div className="max-w-4xl mx-auto text-center animate-fade-in">
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-gray-900 dark:text-white mb-6">
            {t("home.title")}
          </h1>
          <p className="text-xl sm:text-2xl text-gray-600 dark:text-gray-300 mb-4 max-w-2xl mx-auto">
            {t("home.subtitle")}
          </p>
          <p className="text-base sm:text-lg text-gray-500 dark:text-gray-400 mb-10 max-w-xl mx-auto">
            {t("home.description")}
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16 animate-card-in">
            <Link
              href="/practice"
              className="w-full sm:w-auto inline-flex items-center justify-center h-12 px-8 rounded-lg bg-blue-600 text-white font-medium transition-all hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 hover:shadow-lg hover:scale-[1.02] active:scale-[0.98]"
            >
              {t("home.quickStart")}
            </Link>
            <Link
              href="/practice/setup"
              className="w-full sm:w-auto inline-flex items-center justify-center h-12 px-8 rounded-lg bg-blue-500 text-white font-medium transition-all hover:bg-blue-600 dark:bg-blue-400 dark:hover:bg-blue-500 hover:shadow-lg hover:scale-[1.02] active:scale-[0.98]"
            >
              {t("home.chooseMode")}
            </Link>
            <Link
              href="/practice/exam"
              className="w-full sm:w-auto inline-flex items-center justify-center h-12 px-8 rounded-lg bg-purple-600 text-white font-medium transition-all hover:bg-purple-700 dark:bg-purple-500 dark:hover:bg-purple-600 hover:shadow-lg hover:scale-[1.02] active:scale-[0.98]"
            >
              {t("home.mockExam")}
            </Link>
            <Link
              href="/history"
              className="w-full sm:w-auto inline-flex items-center justify-center h-12 px-8 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 font-medium transition-all hover:bg-gray-50 dark:hover:bg-gray-800 hover:shadow-md hover:scale-[1.02] active:scale-[0.98]"
            >
              {t("home.viewHistory")}
            </Link>
          </div>

          {/* Recommendations */}
          <section className="max-w-3xl mx-auto mb-16 text-left">
            <LearningPath />
          </section>

          {/* Feature Cards */}
          <section className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-3xl mx-auto" aria-label="Features">
            <div className="stagger-item bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700 hover:shadow-md transition-shadow">
              <div className="text-3xl mb-4">🎯</div>
              <h3 className="font-semibold text-gray-900 dark:text-white mb-2">
                {t("home.feature1.title")}
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-300">
                {t("home.feature1.desc")}
              </p>
            </div>

            <div className="stagger-item bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700 hover:shadow-md transition-shadow">
              <div className="text-3xl mb-4">📊</div>
              <h3 className="font-semibold text-gray-900 dark:text-white mb-2">
                {t("home.feature2.title")}
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-300">
                {t("home.feature2.desc")}
              </p>
            </div>

            <div className="stagger-item bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700 hover:shadow-md transition-shadow">
              <div className="text-3xl mb-4">💡</div>
              <h3 className="font-semibold text-gray-900 dark:text-white mb-2">
                {t("home.feature3.title")}
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-300">
                {t("home.feature3.desc")}
              </p>
            </div>
          </section>
        </div>
      </main>

      {/* Footer */}
      <footer className="py-6 text-center text-sm text-gray-500 dark:text-gray-400 border-t border-gray-200 dark:border-gray-800">
        <p>{t("home.footer")}</p>
      </footer>
    </div>
  );
}
