import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import MobileNav from "@/components/MobileNav";
import { I18nProvider } from "@/lib/i18n";

const navigationMock = vi.hoisted(() => ({
  pathname: "/",
}));

vi.mock("next/navigation", () => ({
  usePathname: () => navigationMock.pathname,
}));

function renderNav(pathname: string) {
  navigationMock.pathname = pathname;

  render(
    <I18nProvider>
      <MobileNav />
    </I18nProvider>
  );
}

describe("MobileNav", () => {
  beforeEach(() => {
    navigationMock.pathname = "/";
  });

  it("renders the mobile learning nav on regular pages", () => {
    renderNav("/stats");

    expect(screen.getByRole("navigation", { name: "Mobile navigation" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Home" }).getAttribute("href")).toBe("/");
    expect(screen.getByRole("link", { name: "Practice" }).getAttribute("href")).toBe(
      "/practice/setup"
    );
    expect(screen.getByRole("link", { name: "Stats" }).getAttribute("aria-current")).toBe(
      "page"
    );
    expect(screen.getByRole("link", { name: "History" }).getAttribute("href")).toBe(
      "/history"
    );
  });

  it.each(["/practice", "/practice/setup", "/practice/exam", "/admin", "/debug", "/login", "/auth/callback"])(
    "hides the mobile nav on %s",
    (pathname) => {
      renderNav(pathname);

      expect(screen.queryByRole("navigation", { name: "Mobile navigation" })).toBeNull();
    }
  );
});
