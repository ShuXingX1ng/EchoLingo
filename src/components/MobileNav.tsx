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

function NavIcon({ icon }: { icon: NavItem["icon"] }) {
  if (icon === "home") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5">
        <path d="M4 10.75 12 4l8 6.75V20a1 1 0 0 1-1 1h-5v-6h-4v6H5a1 1 0 0 1-1-1v-9.25Z" fill="currentColor" />
      </svg>
    );
  }
  if (icon === "practice") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5">
        <path d="M7 4h10a2 2 0 0 1 2 2v14l-3-1.5L13 20l-3-1.5L7 20l-2-1V6a2 2 0 0 1 2-2Zm2.25 5.5h5.5v-1.5h-5.5v1.5Zm0 4h4.5V12h-4.5v1.5Z" fill="currentColor" />
      </svg>
    );
  }
  if (icon === "stats") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5">
        <path d="M5 19h14v2H5v-2Zm1-8h3v6H6v-6Zm5-6h3v12h-3V5Zm5 4h3v8h-3V9Z" fill="currentColor" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5">
      <path d="M6 4h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Zm2 4v2h8V8H8Zm0 4v2h8v-2H8Zm0 4v2h5v-2H8Z" fill="currentColor" />
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
        className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 px-2 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] pt-2 shadow-[0_-8px_24px_rgba(15,23,42,0.08)] backdrop-blur md:hidden dark:border-white/10 dark:bg-slate-950/95"
      >
        <div className="mx-auto grid max-w-md grid-cols-4 gap-1">
          {items.map((item) => {
            const isActive =
              item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={`flex min-h-12 flex-col items-center justify-center gap-1 rounded-lg px-2 text-xs font-medium transition ${
                  isActive
                    ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
                    : "text-slate-500 hover:bg-slate-100 hover:text-slate-950 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-white"
                }`}
              >
                <NavIcon icon={item.icon} />
                <span className="leading-none">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
