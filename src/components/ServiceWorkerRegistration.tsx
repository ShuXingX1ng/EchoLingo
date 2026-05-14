"use client";

import { useEffect } from "react";

export default function ServiceWorkerRegistration() {
  useEffect(() => {
    if (
      typeof window !== "undefined" &&
      "serviceWorker" in navigator &&
      process.env.NODE_ENV === "production"
    ) {
      navigator.serviceWorker
        .register("/sw.js")
        .then((registration) => {
          console.log("SW registered:", registration.scope);

          // 检查更新
          registration.addEventListener("updatefound", () => {
            const newWorker = registration.installing;
            if (newWorker) {
              newWorker.addEventListener("statechange", () => {
                if (
                  newWorker.state === "activated" &&
                  navigator.serviceWorker.controller
                ) {
                  // 新版本可用，可以提示用户刷新
                  console.log("New version available");
                }
              });
            }
          });
        })
        .catch((error) => {
          console.log("SW registration failed:", error);
        });
    }
  }, []);

  return null;
}
