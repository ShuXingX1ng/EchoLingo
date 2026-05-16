"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { useTranslation } from "@/lib/i18n";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, profile, loading } = useAuth();
  const { t } = useTranslation();
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    if (!loading) {
      if (!user || profile?.role !== "admin") {
        router.push("/");
      } else {
        setAuthorized(true);
      }
    }
  }, [user, profile, loading, router]);

  if (loading || !authorized) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="flex gap-2">
          <div className="w-3 h-3 bg-blue-500 rounded-full animate-bounce" />
          <div className="w-3 h-3 bg-blue-500 rounded-full animate-bounce [animation-delay:-0.15s]" />
          <div className="w-3 h-3 bg-blue-500 rounded-full animate-bounce [animation-delay:-0.3s]" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-gray-50 dark:bg-gray-950">
      <header className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-4 py-3">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
            >
              {t("nav.home")}
            </Link>
            <h1 className="font-semibold text-gray-900 dark:text-white">
              {t("admin.title")}
            </h1>
          </div>
          <nav className="flex items-center gap-4">
            <Link
              href="/admin"
              className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
            >
              {t("admin.title")}
            </Link>
            <Link
              href="/admin/topics"
              className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
            >
              {t("admin.topics")}
            </Link>
            <Link
              href="/admin/users"
              className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
            >
              {t("admin.users")}
            </Link>
          </nav>
        </div>
      </header>
      <main className="flex-1 p-4">
        <div className="max-w-6xl mx-auto">{children}</div>
      </main>
    </div>
  );
}
