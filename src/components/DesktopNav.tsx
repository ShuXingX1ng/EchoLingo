"use client";

import Link from "next/link";
import MuteButton from "@/components/MuteButton";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import UserMenu from "@/components/UserMenu";
import { useTranslation } from "@/lib/i18n";

type NavItem = "home" | "practice" | "stats" | "history" | "settings";

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
    { key: "stats", href: "/stats", label: t("nav.stats") },
    { key: "history", href: "/history", label: t("nav.history") },
    { key: "settings", href: "/settings", label: t("nav.settings") },
  ];

  return (
    <header className="border-b border-slate-200 bg-white/90 px-4 py-4 backdrop-blur dark:border-white/10 dark:bg-slate-950/90">
      <div className={`mx-auto flex ${maxWidthClasses[maxWidth]} items-center justify-between gap-4`}>
        {/* Logo */}
        <Link href="/" className="group flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center border border-slate-900 bg-slate-950 text-xs font-semibold text-white dark:border-white dark:bg-white dark:text-slate-950">
            EL
          </span>
          <span className="hidden sm:block">
            <span className="block text-sm font-semibold tracking-[0.12em] text-slate-950 dark:text-white">
              EchoLingo
            </span>
          </span>
        </Link>

        {/* Nav Links */}
        <nav className="hidden items-center gap-6 text-sm font-medium text-slate-500 dark:text-slate-400 md:flex">
          {links.map((link) => (
            <Link
              key={link.key}
              href={link.href}
              className={
                active === link.key
                  ? "text-slate-950 dark:text-white"
                  : "transition-colors hover:text-slate-950 dark:hover:text-white"
              }
            >
              {link.label}
            </Link>
          ))}
        </nav>

        {/* Right Side */}
        <div className="flex items-center gap-3">
          {rightContent}
          <MuteButton />
          <LanguageSwitcher />
          <UserMenu />
        </div>
      </div>
    </header>
  );
}
