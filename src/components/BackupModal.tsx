"use client";

import { useState, useRef } from "react";
import {
  downloadBackup,
  importBackup,
  setLastBackupDate,
  type ImportResult,
} from "@/lib/backup";

type BackupModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onImportComplete?: () => void;
};

export default function BackupModal({
  isOpen,
  onClose,
  onImportComplete,
}: BackupModalProps) {
  const [activeTab, setActiveTab] = useState<"export" | "import">("export");
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleExport = () => {
    downloadBackup();
    setLastBackupDate();
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    setImportResult(null);

    const result = await importBackup(file);
    setImportResult(result);
    setIsImporting(false);

    if (result.success && onImportComplete) {
      onImportComplete();
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-900 rounded-2xl max-w-md w-full shadow-2xl">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
              Backup & Restore
            </h2>
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg transition-colors"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>

          <div className="flex gap-2 mb-6">
            <button
              onClick={() => {
                setActiveTab("export");
                setImportResult(null);
              }}
              className={`flex-1 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                activeTab === "export"
                  ? "bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300"
                  : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
              }`}
            >
              Export
            </button>
            <button
              onClick={() => {
                setActiveTab("import");
                setImportResult(null);
              }}
              className={`flex-1 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                activeTab === "import"
                  ? "bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300"
                  : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
              }`}
            >
              Import
            </button>
          </div>

          {activeTab === "export" ? (
            <div className="space-y-4">
              <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-4">
                <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-2">
                  Export Your Data
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                  Download a backup file containing all your practice sessions,
                  goals, and settings. You can use this file to restore your data
                  later or transfer it to another device.
                </p>
                <ul className="text-xs text-gray-500 dark:text-gray-500 space-y-1 mb-4">
                  <li>• Practice sessions and feedback</li>
                  <li>• Practice goals</li>
                  <li>• Voice settings</li>
                </ul>
              </div>
              <button
                onClick={handleExport}
                className="w-full px-4 py-3 text-sm font-medium text-white bg-blue-600 rounded-xl hover:bg-blue-700 transition-colors"
              >
                Download Backup File
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-4">
                <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-2">
                  Import Data
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                  Restore your data from a previously exported backup file.
                  Existing sessions will be merged with the imported data.
                </p>
                <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3">
                  <p className="text-xs text-yellow-700 dark:text-yellow-400">
                    Note: Importing will merge data. Sessions with the same ID
                    will not be duplicated.
                  </p>
                </div>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                onChange={handleImport}
                className="hidden"
                id="backup-file-input"
              />
              <label
                htmlFor="backup-file-input"
                className="block w-full px-4 py-3 text-sm font-medium text-center text-white bg-blue-600 rounded-xl hover:bg-blue-700 transition-colors cursor-pointer"
              >
                {isImporting ? "Importing..." : "Select Backup File"}
              </label>

              {importResult && (
                <div
                  className={`p-4 rounded-xl ${
                    importResult.success
                      ? "bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800"
                      : "bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800"
                  }`}
                >
                  <p
                    className={`text-sm ${
                      importResult.success
                        ? "text-green-700 dark:text-green-400"
                        : "text-red-700 dark:text-red-400"
                    }`}
                  >
                    {importResult.message}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
