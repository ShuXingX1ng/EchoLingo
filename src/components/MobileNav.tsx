"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslation } from "@/lib/i18n";

type NavItem = {
  href: string;
  label: string;
  icon: "home" | "practice" | "stats" | "history";
};

const hiddenPrefixes = ["/practice", "/admin", "/debug", "/login", "/auth"];

function NavIcon({ icon, active }: { icon: NavItem["icon"]; active: boolean }) {
  const cls = `h-5 w-5 transition-transform ${active ? "scale-110" : ""}`;

  if (icon === "home") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className={cls} fill="none" stroke="currentColor" strokeWidth={active ? 2.5 : 2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 12L12 4l9 8" />
        <path d="M5 10v9a1 1 0 001 1h4v-5h4v5h4a1 1 0 001-1v-9" />
      </svg>
    );
  }
  if (icon === "practice") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className={cls} fill="none" stroke="currentColor" strokeWidth={active ? 2.5 : 2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
      </svg>
    );
  }
  if (icon === "stats") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className={cls} fill="none" stroke="currentColor" strokeWidth={active ? 2.5 : 2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 20V10M12 20V4M6 20v-6" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={cls} fill="none" stroke="currentColor" strokeWidth={active ? 2.5 : 2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
      <polyline points="14,2 14,8 20,8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10,9 9,9 8,9" />
    </svg>
  );
}

export default function MobileNav() {
  const pathname = usePathname();
  const { t } = useTranslation();

  if (hiddenPrefixes.some((prefix) => pathname.startsWith(prefix))) {
    return null;
  }

  const items: NavItem[] = [
    { href: "/", label: t("nav.home"), icon: "home" },
    { href: "/practice/setup", label: t("nav.practice"), icon: "practice" },
    { href: "/stats", label: t("nav.stats"), icon: "stats" },
    { href: "/history", label: t("nav.history"), icon: "history" },
  ];

  return (
    <>
      <div className="h-20 md:hidden" aria-hidden="true" />
      <nav
        aria-label="Mobile navigation"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--border)] bg-[var(--surface)]/98 px-2 pb-[calc(env(safe-area-inset-bottom)+0.375rem)] pt-2 shadow-[0_-4px_20px_rgba(0,0,0,0.06)] backdrop-blur-md md:hidden"
      >
        <div className="mx-auto grid max-w-md grid-cols-4 gap-0.5">
          {items.map((item) => {
            const isActive =
              item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={`flex min-h-12 flex-col items-center justify-center gap-1 rounded-xl px-1 text-[11px] font-medium transition-all ${
                  isActive
                    ? "text-emerald-700 dark:text-emerald-400"
                    : "text-[var(--text-secondary)] hover:text-[var(--foreground)]"
                }`}
              >
                <span className={`relative flex items-center justify-center rounded-lg p-1.5 ${isActive ? "bg-emerald-50 dark:bg-emerald-900/30" : ""}`}>
                  <NavIcon icon={item.icon} active={isActive} />
                </span>
                <span className="leading-none">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
