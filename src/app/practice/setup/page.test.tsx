import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import PracticeSetupPage from "@/app/practice/setup/page";
import { I18nProvider } from "@/lib/i18n";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ user: null, loading: false }),
}));

function renderPage() {
  render(
    <I18nProvider>
      <PracticeSetupPage />
    </I18nProvider>
  );
}

describe("PracticeSetupPage", () => {
  it("starts a focused speaking drill with the selected IELTS part and topic", () => {
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: /Part 3: Discussion/ }));
    fireEvent.click(screen.getByRole("button", { name: "Hometown" }));

    expect(screen.getByRole("link", { name: "Start Practice" }).getAttribute("href")).toBe(
      "/practice?mode=part3&topic=hometown"
    );
  });

  it("switches the start URL to the mock exam flow", () => {
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: /Mock Exam/ }));
    fireEvent.click(screen.getByRole("button", { name: "Hometown" }));

    expect(screen.getByRole("link", { name: "Start Mock Exam" }).getAttribute("href")).toBe(
      "/practice/exam?topic=hometown"
    );
  });

  it("switches the start URL to shadowing with the current mode and topic", () => {
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: /Shadowing Lab/ }));
    fireEvent.click(screen.getByRole("button", { name: /Part 2: Long Turn/ }));
    fireEvent.click(screen.getByRole("button", { name: "Hometown" }));

    expect(screen.getByRole("link", { name: "Start Practice" }).getAttribute("href")).toBe(
      "/practice/shadowing?mode=part2&topic=hometown"
    );
  });
});
