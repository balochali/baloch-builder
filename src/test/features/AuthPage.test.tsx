import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import { describe, expect, it, vi } from "vitest";
import { AuthPage } from "@/features/auth/AuthPage";

describe("AuthPage", () => {
  it("creates an account only when passwords match", async () => {
    const success = vi.fn();
    render(<AuthPage mode="setup" onSuccess={success} />);
    fireEvent.change(screen.getByLabelText("Username"), { target: { value: "owner" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "a-long-password" } });
    fireEvent.change(screen.getByLabelText("Confirm password"), { target: { value: "different-password" } });
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Passwords do not match.");
    expect(invoke).not.toHaveBeenCalled();
    expect(success).not.toHaveBeenCalled();
  });

  it("passes credentials to the backend and opens the app after login", async () => {
    const success = vi.fn();
    render(<AuthPage mode="login" onSuccess={success} />);
    fireEvent.change(screen.getByLabelText("Username"), { target: { value: "owner" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "a-long-password" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() => expect(invoke).toHaveBeenCalledWith("login", {
      username: "owner", password: "a-long-password",
    }));
    await waitFor(() => expect(success).toHaveBeenCalledOnce());
  });
});
