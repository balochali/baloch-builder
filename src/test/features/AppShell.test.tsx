import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "@/app/layout/AppShell";

describe("workspace navigation drawer", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({ matches: false })),
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it("navigates to a page, closes, and returns focus to the menu button", async () => {
    render(
      <MemoryRouter>
        <Routes>
          <Route element={<AppShell onLogout={vi.fn()} />}>
            <Route path="/" element={<h1>Home content</h1>} />
            <Route path="/partners" element={<h1>Partner content</h1>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );
    const menu = screen.getByRole("button", { name: "Open navigation" });
    fireEvent.click(menu);
    const dialog = await screen.findByRole("dialog", { name: "Workspace navigation" });
    fireEvent.click(within(dialog).getByRole("link", { name: "Partners" }));
    expect(await screen.findByRole("heading", { name: "Partner content" })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(menu).toHaveFocus());
  });

  it("keeps logout accessible from the drawer", async () => {
    const logout = vi.fn();
    render(
      <MemoryRouter>
        <AppShell onLogout={logout} />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Open navigation" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Log out" }));
    expect(logout).toHaveBeenCalledOnce();
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });
});

it('hides financial and admin menus from a construction user while retaining shell classes',()=>{
 vi.stubGlobal('matchMedia',vi.fn(()=>({matches:false})));
 const {container}=render(<MemoryRouter><AppShell role="construction" onLogout={vi.fn()}/></MemoryRouter>);
 expect(screen.getByRole('link',{name:'Projects'})).toBeInTheDocument();
 for(const name of ['Vouchers','General journal','Users and roles','Settings','Partners'])expect(screen.queryByRole('link',{name})).not.toBeInTheDocument();
 expect(container.querySelector('.app-shell .app-sidebar .brand-block')).not.toBeNull();
 vi.unstubAllGlobals();
});
