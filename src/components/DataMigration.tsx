"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { migrateLocalToCloud } from "@/lib/unified-history";
import { getSessions } from "@/lib/history";

export default function DataMigration() {
  const { user } = useAuth();
  const [showMigration, setShowMigration] = useState(false);
  const [migrating, setMigrating] = useState(false);
  const [result, setResult] = useState<{
    success: number;
    failed: number;
    total: number;
  } | null>(null);
  const [showDebug, setShowDebug] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Check if there are local sessions to migrate
    if (user && !dismissed) {
      const localSessions = getSessions();
      if (localSessions.length > 0) {
        // Check if migration prompt was already dismissed
        const migrationDismissed = localStorage.getItem(
          "echolingo_migration_dismissed"
        );
        if (!migrationDismissed) {
          setShowMigration(true);
        }
      }
    }
  }, [user, dismissed]);

  const handleMigrate = async () => {
    setMigrating(true);
    setShowDebug(false);
    try {
      const result = await migrateLocalToCloud();
      setResult(result);
      if (result.failed === 0) {
        localStorage.setItem("echolingo_migration_dismissed", "true");
      }
    } catch (error) {
      console.error("Migration failed:", error);
      setResult({ success: 0, failed: 0, total: 0 });
    }
    setMigrating(false);
  };

  const handleRetry = () => {
    setResult(null);
    handleMigrate();
  };

  const handleDismiss = () => {
    localStorage.setItem("echolingo_migration_dismissed", "true");
    setShowMigration(false);
    setDismissed(true);
  };

  if (!showMigration || !user) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:w-96 z-50">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 p-4">
        {result ? (
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-white mb-2">
              {result.failed === 0 ? "迁移完成！" : "迁移部分完成"}
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
              {result.success > 0 && `成功迁移 ${result.success} 条记录。`}
              {result.failed > 0 && `失败 ${result.failed} 条。`}
            </p>
            {result.failed > 0 && (
              <div className="text-xs text-amber-600 dark:text-amber-400 mb-3 bg-amber-50 dark:bg-amber-900/20 p-2 rounded">
                <p className="font-medium mb-1">可能的原因：</p>
                <ul className="list-disc list-inside space-y-1">
                  <li>数据库表未创建（需执行 supabase-schema.sql）</li>
                  <li>RLS 策略阻止了插入操作</li>
                </ul>
                <button
                  onClick={() => setShowDebug(!showDebug)}
                  className="mt-2 text-blue-500 hover:text-blue-600 underline"
                >
                  {showDebug ? "隐藏" : "查看"}调试信息
                </button>
                {showDebug && (
                  <pre className="mt-2 p-2 bg-gray-100 dark:bg-gray-900 rounded text-xs overflow-auto max-h-32">
                    打开浏览器控制台 (F12) 查看详细错误日志
                  </pre>
                )}
              </div>
            )}
            <div className="flex gap-2">
              {result.failed > 0 && (
                <button
                  onClick={handleRetry}
                  className="flex-1 bg-blue-500 hover:bg-blue-600 text-white py-2 rounded-lg text-sm font-medium transition-colors"
                >
                  重试
                </button>
              )}
              <button
                onClick={handleDismiss}
                className="flex-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 py-2 rounded-lg text-sm font-medium hover:bg-gray-200 dark:hover:bg-gray-600"
              >
                {result.failed > 0 ? "稍后再说" : "知道了"}
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-start gap-3 mb-3">
              <div className="text-2xl">☁️</div>
              <div>
                <h3 className="font-semibold text-gray-900 dark:text-white">
                  同步本地数据
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  检测到本地有练习记录，是否同步到云端？同步后可在多设备间访问。
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleMigrate}
                disabled={migrating}
                className="flex-1 bg-blue-500 hover:bg-blue-600 disabled:bg-blue-300 text-white py-2 rounded-lg text-sm font-medium transition-colors"
              >
                {migrating ? "同步中..." : "同步"}
              </button>
              <button
                onClick={handleDismiss}
                disabled={migrating}
                className="flex-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 py-2 rounded-lg text-sm font-medium hover:bg-gray-200 dark:hover:bg-gray-600"
              >
                稍后
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
