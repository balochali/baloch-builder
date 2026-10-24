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

it('uses server credentials without changing the default login wording',async()=>{
 const authenticate=vi.fn().mockResolvedValue(undefined);const success=vi.fn();
 render(<AuthPage mode="login" authenticate={authenticate} onSuccess={success}/>);
 fireEvent.change(screen.getByLabelText('Username'),{target:{value:'accountant@example.test'}});
 fireEvent.change(screen.getByLabelText('Password'),{target:{value:'example-password'}});
 fireEvent.click(screen.getByRole('button',{name:'Sign in'}));
 await waitFor(()=>expect(authenticate).toHaveBeenCalledWith('accountant@example.test','example-password',undefined));
 expect(screen.getByText('Welcome back')).toBeInTheDocument();expect(screen.getByText('Your records stay on this device.')).toBeInTheDocument();
});
it('requests a two-factor code only when the server requires it',async()=>{
 const authenticate=vi.fn().mockRejectedValueOnce(new Error('A valid, unused two-factor code is required')).mockResolvedValue(undefined);
 render(<AuthPage mode="login" authenticate={authenticate} onSuccess={vi.fn()}/>);
 expect(screen.queryByLabelText('Two-factor code')).not.toBeInTheDocument();
 fireEvent.change(screen.getByLabelText('Username'),{target:{value:'admin@example.test'}});fireEvent.change(screen.getByLabelText('Password'),{target:{value:'example-password'}});fireEvent.click(screen.getByRole('button',{name:'Sign in'}));
 fireEvent.change(await screen.findByLabelText('Two-factor code'),{target:{value:'123456'}});fireEvent.click(screen.getByRole('button',{name:'Sign in'}));
 await waitFor(()=>expect(authenticate).toHaveBeenLastCalledWith('admin@example.test','example-password','123456'));
});
