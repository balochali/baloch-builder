import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { api, SESSION_EXPIRED_MESSAGE } from "@/data/api";
import { AppRouter } from "@/app/router";

// Keep the real router, login, shell and API. Replace only the unrelated grid page.
vi.mock("@/features/accounting/AccountingPage", () => ({
  AccountingPage: () => (
    <button
      onClick={() => {
        void api("accounts").catch(() => {});
      }}
    >
      Load accounts
    </button>
  ),
}));
beforeEach(() => {
  window.location.hash = "#/projects";
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: false })),
  );
});
afterEach(() => vi.unstubAllGlobals());
const user = { id: "user-1", email: "accountant@example.test", role: "accountant" };
it("returns from a working page to unchanged login on 401 and clears the message after signing in", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(user)))
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(user))),
  );
  render(<AppRouter />);
  fireEvent.click(await screen.findByRole("button", { name: "Load accounts" }));
  expect(await screen.findByRole("heading", { name: "Welcome back" })).toBeInTheDocument();
  expect(screen.getByRole("alert")).toHaveTextContent(SESSION_EXPIRED_MESSAGE);
  expect(screen.queryByRole("button", { name: "Load accounts" })).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Username"), { target: { value: user.email } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "long-password" } });
  fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
  expect(await screen.findByRole("button", { name: "Load accounts" })).toBeInTheDocument();
  await waitFor(() => expect(screen.queryByText(SESSION_EXPIRED_MESSAGE)).not.toBeInTheDocument());
});
it("does not show an expiry warning on the initial anonymous visit", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 401 })));
  render(<AppRouter />);
  expect(await screen.findByRole("heading", { name: "Welcome back" })).toBeInTheDocument();
  expect(screen.queryByText(SESSION_EXPIRED_MESSAGE)).not.toBeInTheDocument();
});
