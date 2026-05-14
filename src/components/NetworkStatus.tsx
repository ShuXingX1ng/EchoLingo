"use client";

import { useNetworkStatus } from "@/hooks/useNetworkStatus";

export default function NetworkStatus() {
  const { isOnline, isSlowConnection } = useNetworkStatus();

  if (isOnline && !isSlowConnection) {
    return null;
  }

  return (
    <div
      className={`fixed bottom-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-full shadow-lg text-sm font-medium animate-slide-up ${
        !isOnline
          ? "bg-red-500 text-white"
          : "bg-yellow-500 text-yellow-900"
      }`}
    >
      <div className="flex items-center gap-2">
        <span className={`w-2 h-2 rounded-full ${!isOnline ? "bg-red-200" : "bg-yellow-200"} animate-pulse`} />
        {!isOnline ? "You are offline" : "Slow connection detected"}
      </div>
    </div>
  );
}
