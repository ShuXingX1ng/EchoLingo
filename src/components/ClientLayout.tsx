"use client";

import { type ReactNode } from "react";
import ErrorBoundary from "./ErrorBoundary";
import NetworkStatus from "./NetworkStatus";
import PWAInstallPrompt from "./PWAInstallPrompt";
import ServiceWorkerRegistration from "./ServiceWorkerRegistration";

interface ClientLayoutProps {
  children: ReactNode;
}

export default function ClientLayout({ children }: ClientLayoutProps) {
  return (
    <ErrorBoundary>
      {children}
      <NetworkStatus />
      <PWAInstallPrompt />
      <ServiceWorkerRegistration />
    </ErrorBoundary>
  );
}
