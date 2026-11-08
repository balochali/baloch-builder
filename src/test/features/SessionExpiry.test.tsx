import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { api, SESSION_EXPIRED_MESSAGE } from "@/data/api";
import { AuthPage } from "@/features/auth/AuthPage";
import { AppRouter } from "@/app/router";

beforeEach(() => {
  window.location.hash = "#/land";
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
  const baseline = render(
    <AuthPage mode="login" onSuccess={() => {}} authenticate={async () => {}} />,
  );
  const loginStructure = baseline.container.firstElementChild!.outerHTML;
  baseline.unmount();
  const rendered = render(<AppRouter />);
  expect(await screen.findByRole("heading", { name: "Lands" })).toBeInTheDocument();
  await act(async () => {
    await api("accounts").catch(() => {});
  });
  expect(await screen.findByRole("heading", { name: "Welcome back" })).toBeInTheDocument();
  expect(screen.getByRole("alert")).toHaveTextContent(SESSION_EXPIRED_MESSAGE);
  expect(screen.getByRole("alert")).toHaveStyle({ position: "fixed", top: "0px" });
  expect(rendered.container.children[1].outerHTML).toBe(loginStructure);
  expect(screen.queryByRole("button", { name: "Load accounts" })).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Username"), { target: { value: user.email } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "long-password" } });
  fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
  expect(await screen.findByRole("heading", { name: "Dashboard" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Dashboard" })).toHaveAttribute("aria-current", "page");
  await waitFor(() => expect(screen.queryByText(SESSION_EXPIRED_MESSAGE)).not.toBeInTheDocument());
});
it("does not show an expiry warning on the initial anonymous visit", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 401 })));
  render(<AppRouter />);
  expect(await screen.findByRole("heading", { name: "Welcome back" })).toBeInTheDocument();
  expect(screen.queryByText(SESSION_EXPIRED_MESSAGE)).not.toBeInTheDocument();
});
