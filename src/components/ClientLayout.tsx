"use client";

import { type ReactNode, useEffect } from "react";
import ErrorBoundary from "./ErrorBoundary";
import NetworkStatus from "./NetworkStatus";
import PWAInstallPrompt from "./PWAInstallPrompt";
import ServiceWorkerRegistration from "./ServiceWorkerRegistration";
import { setupGlobalErrorHandlers } from "@/lib/error-logger";

interface ClientLayoutProps {
  children: ReactNode;
}

export default function ClientLayout({ children }: ClientLayoutProps) {
  useEffect(() => {
    const cleanup = setupGlobalErrorHandlers();
    return cleanup;
  }, []);

  return (
    <ErrorBoundary>
      {children}
      <NetworkStatus />
      <PWAInstallPrompt />
      <ServiceWorkerRegistration />
    </ErrorBoundary>
  );
}
