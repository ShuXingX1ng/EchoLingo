"use client";

import Link from "next/link";
import MuteButton from "@/components/MuteButton";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import UserMenu from "@/components/UserMenu";
import { useTranslation } from "@/lib/i18n";

type NavItem = "home" | "practice" | "vocabulary" | "stats" | "history" | "settings";

const maxWidthClasses = {
  "4xl": "max-w-4xl",
  "5xl": "max-w-5xl",
  "7xl": "max-w-7xl",
} as const;

export default function DesktopNav({
  active,
  maxWidth = "5xl",
  rightContent,
}: {
  active?: NavItem;
  maxWidth?: "4xl" | "5xl" | "7xl";
  rightContent?: React.ReactNode;
}) {
  const { t } = useTranslation();

  const links: { key: NavItem; href: string; label: string }[] = [
    { key: "home", href: "/", label: t("nav.home") },
    { key: "practice", href: "/practice", label: t("nav.practice") },
    { key: "vocabulary", href: "/vocabulary", label: t("nav.vocabulary") },
    { key: "stats", href: "/stats", label: t("nav.stats") },
    { key: "history", href: "/history", label: t("nav.history") },
    { key: "settings", href: "/settings", label: t("nav.settings") },
  ];

  return (
    <header className="sticky top-0 z-50 border-b border-[var(--border)] bg-[var(--surface)]/95 backdrop-blur-sm">
      <div className={`mx-auto flex ${maxWidthClasses[maxWidth]} items-center justify-between gap-4 px-4 py-3 sm:px-6`}>
        {/* Logo */}
        <Link href="/" className="group flex items-center gap-2.5 shrink-0">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600 text-xs font-bold text-white shadow-sm">
            EL
          </span>
          <span className="hidden text-sm font-semibold tracking-tight text-[var(--foreground)] sm:block">
            EchoLingo
          </span>
        </Link>

        {/* Nav Links */}
        <nav className="hidden items-center gap-1 md:flex" aria-label="Main navigation">
          {links.map((link) => (
            <Link
              key={link.key}
              href={link.href}
              className={`relative rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                active === link.key
                  ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
                  : "text-[var(--text-secondary)] hover:bg-gray-100 hover:text-[var(--foreground)] dark:hover:bg-white/10 dark:hover:text-white"
              }`}
              aria-current={active === link.key ? "page" : undefined}
            >
              {link.label}
              {active === link.key && (
                <span className="absolute inset-x-3 -bottom-[13px] h-0.5 rounded-full bg-emerald-600" />
              )}
            </Link>
          ))}
        </nav>

        {/* Right Side */}
        <div className="flex items-center gap-2">
          {rightContent}
          <MuteButton />
          <LanguageSwitcher />
          <UserMenu />
        </div>
      </div>
    </header>
  );
}
