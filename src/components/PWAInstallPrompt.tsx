"use client";

import { useState, useEffect } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export default function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [showInstall, setShowInstall] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    // 检查是否已安装
    if (
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as { standalone?: boolean }).standalone === true
    ) {
      setIsInstalled(true);
      return;
    }

    // 监听安装事件
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setShowInstall(true);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setShowInstall(false);
      setDeferredPrompt(null);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstall);
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;

    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;

    if (outcome === "accepted") {
      setIsInstalled(true);
    }

    setShowInstall(false);
    setDeferredPrompt(null);
  };

  const handleDismiss = () => {
    setShowInstall(false);
    // 存储用户选择，24小时内不再显示
    localStorage.setItem(
      "pwa_install_dismissed",
      Date.now().toString()
    );
  };

  // 检查是否被用户忽略
  useEffect(() => {
    const dismissed = localStorage.getItem("pwa_install_dismissed");
    if (dismissed) {
      const dismissedTime = parseInt(dismissed);
      const hoursSinceDismiss = (Date.now() - dismissedTime) / (1000 * 60 * 60);
      if (hoursSinceDismiss < 24) {
        setShowInstall(false);
      }
    }
  }, []);

  if (isInstalled || !showInstall) {
    return null;
  }

  return (
    <div className="fixed bottom-20 left-4 right-4 sm:left-auto sm:right-4 sm:w-80 z-50 animate-slide-up">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 p-4">
        <div className="flex items-start gap-3">
          <div className="text-2xl">📱</div>
          <div className="flex-1">
            <h3 className="font-medium text-gray-900 dark:text-white text-sm">
              Install EchoLingo
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Add to your home screen for quick access and offline use.
            </p>
            <div className="flex gap-2 mt-3">
              <button
                onClick={handleInstall}
                className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
              >
                Install
              </button>
              <button
                onClick={handleDismiss}
                className="px-3 py-1.5 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
              >
                Not now
              </button>
            </div>
          </div>
          <button
            onClick={handleDismiss}
            className="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300"
          >
            <svg
              className="w-4 h-4"
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
      </div>
    </div>
  );
}
