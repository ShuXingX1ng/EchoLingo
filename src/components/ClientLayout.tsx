"use client";

import { type ReactNode, useEffect } from "react";
import ErrorBoundary from "./ErrorBoundary";
import NetworkStatus from "./NetworkStatus";
import PWAInstallPrompt from "./PWAInstallPrompt";
import ServiceWorkerRegistration from "./ServiceWorkerRegistration";
import DataMigration from "./DataMigration";
import MobileNav from "./MobileNav";
import { setupGlobalErrorHandlers } from "@/lib/error-logger";
import { AuthProvider } from "@/lib/auth-context";
import { I18nProvider } from "@/lib/i18n";

interface ClientLayoutProps {
  children: ReactNode;
}

export default function ClientLayout({ children }: ClientLayoutProps) {
  useEffect(() => {
    const cleanup = setupGlobalErrorHandlers();
    return cleanup;
  }, []);

  return (
    <I18nProvider>
      <AuthProvider>
        <ErrorBoundary>
          {children}
          <NetworkStatus />
          <PWAInstallPrompt />
          <ServiceWorkerRegistration />
          <DataMigration />
          <MobileNav />
        </ErrorBoundary>
      </AuthProvider>
    </I18nProvider>
  );
}
