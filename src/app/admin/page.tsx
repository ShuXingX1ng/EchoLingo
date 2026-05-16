"use client";

import Link from "next/link";
import { useTranslation } from "@/lib/i18n";

export default function AdminPage() {
  const { t } = useTranslation();

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
        {t("admin.title")}
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Link
          href="/admin/topics"
          className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700 hover:shadow-md transition-shadow"
        >
          <div className="text-3xl mb-3">📝</div>
          <h3 className="font-semibold text-gray-900 dark:text-white mb-2">
            {t("admin.topics")}
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-300">
            {t("admin.topicsDesc")}
          </p>
        </Link>

        <Link
          href="/admin/users"
          className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700 hover:shadow-md transition-shadow"
        >
          <div className="text-3xl mb-3">👥</div>
          <h3 className="font-semibold text-gray-900 dark:text-white mb-2">
            {t("admin.users")}
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-300">
            {t("admin.usersDesc")}
          </p>
        </Link>
      </div>
    </div>
  );
}
