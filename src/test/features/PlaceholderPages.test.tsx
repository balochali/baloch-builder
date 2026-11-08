import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { AppRouter } from "@/app/router";
afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});
it("shows a titled work-in-progress page for every sidebar item", async () => {
  window.location.hash = "#/";
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: false })),
  );
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ id: "admin", email: "admin@example.test", role: "admin" })),
      ),
  );
  render(<AppRouter />);
  await screen.findByRole("heading", { name: "Dashboard" });
  for (const name of [
    "Lands (overview of all land)",
    "Add Entry",
    "Ledger",
    "Bank Accounts",
    "Personal",
    "Parties",
    "Reports",
    "Settings",
    "Dashboard",
  ]) {
    fireEvent.click(
      within(screen.getByRole("navigation", { name: "Main navigation" })).getByRole("link", {
        name,
      }),
    );
    expect(await screen.findByRole("heading", { name })).toBeInTheDocument();
    expect(screen.getByText(/Work is in progress on/)).toBeInTheDocument();
  }
});
