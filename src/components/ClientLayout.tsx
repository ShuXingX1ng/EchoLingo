"use client";

import { type ReactNode, useEffect } from "react";
import { usePathname } from "next/navigation";
import ErrorBoundary from "./ErrorBoundary";
import NetworkStatus from "./NetworkStatus";
import PWAInstallPrompt from "./PWAInstallPrompt";
import ServiceWorkerRegistration from "./ServiceWorkerRegistration";
import DataMigration from "./DataMigration";
import MobileNav from "./MobileNav";
import StudyAssistant from "./StudyAssistant";
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

  const pathname = usePathname();
  const isMockExam = pathname?.startsWith("/mock") ?? false;

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
          {!isMockExam && <StudyAssistant />}
        </ErrorBoundary>
      </AuthProvider>
    </I18nProvider>
  );
}
