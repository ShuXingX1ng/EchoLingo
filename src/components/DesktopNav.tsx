"use client";

import Link from "next/link";
import {
  House,
  PenLine,
  BookOpen,
  BarChart2,
  Clock,
  Settings,
} from "lucide-react";
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

const NAV_ICONS: Record<NavItem, React.ElementType> = {
  home: House,
  practice: PenLine,
  vocabulary: BookOpen,
  stats: BarChart2,
  history: Clock,
  settings: Settings,
};

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
    <header
      className="sticky top-0 z-50 border-b border-[var(--border)] backdrop-blur-xl"
      style={{ background: "rgba(255,255,255,.84)" }}
    >
      <div
        className={`mx-auto flex ${maxWidthClasses[maxWidth]} items-center justify-between gap-4 px-4 py-2.5 sm:px-6`}
      >
        {/* Logo */}
        <Link href="/" className="group flex items-center gap-3 shrink-0">
          <span
            className="flex h-9 w-9 items-center justify-center rounded-xl text-xs font-extrabold text-white tracking-wide shadow-[0_8px_18px_rgba(0,122,83,.28)]"
            style={{
              background: "linear-gradient(145deg, #009d68, #005a45)",
            }}
          >
            EL
          </span>
          <span className="hidden text-[15px] font-bold tracking-tight text-slate-800 sm:block">
            EchoLingo
          </span>
        </Link>

        {/* Nav Links */}
        <nav className="hidden items-center gap-1 md:flex" aria-label="Main navigation">
          {links.map((link) => {
            const Icon = NAV_ICONS[link.key];
            const isActive = active === link.key;
            return (
              <Link
                key={link.key}
                href={link.href}
                className={`relative flex h-11 items-center gap-2 rounded-[14px] px-4 text-sm font-semibold transition-all duration-150 ${
                  isActive
                    ? "bg-emerald-50 text-emerald-700 shadow-[inset_0_-2px_0_#007a53]"
                    : "text-slate-500 hover:bg-slate-50 hover:text-slate-800"
                }`}
                aria-current={isActive ? "page" : undefined}
              >
                <Icon className="h-[18px] w-[18px]" strokeWidth={2} />
                {link.label}
              </Link>
            );
          })}
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
