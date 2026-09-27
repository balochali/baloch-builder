import { useState, type FormEvent } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Eye, EyeOff, LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface AuthPageProps {
  mode: "setup" | "login";
  onSuccess: () => void;
}

export function AuthPage({ mode, onSuccess }: AuthPageProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const setup = mode === "setup";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (setup && password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setPending(true);
    try {
      await invoke(setup ? "create_account" : "login", { username, password });
      setPassword("");
      setConfirmPassword("");
      onSuccess();
    } catch (cause) {
      setError(String(cause));
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="auth-page min-h-screen flex items-center justify-center bg-muted/40 p-4">
      <div className="auth-panel w-full max-w-md rounded-xl border bg-card p-8 shadow-lg">
        <div className="mb-8 text-center">
          <div className="auth-symbol mx-auto mb-4 flex size-14 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            {setup ? <span className="brand-mark auth-brand-mark" role="img" aria-label="Baloch Builders logo" /> : <LockKeyhole className="size-7" />}
          </div>
          <h1 className="text-2xl font-bold">Baloch Builders</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {setup ? "Create your account to protect this device's records." : "Sign in to open your workspace."}
          </p>
        </div>

        <form onSubmit={submit} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="auth-username">Username</Label>
            <Input id="auth-username" autoComplete="username" autoFocus required minLength={3}
              maxLength={64} value={username} onChange={(event) => setUsername(event.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="auth-password">Password</Label>
            <div className="relative">
              <Input id="auth-password" type={showPassword ? "text" : "password"}
                autoComplete={setup ? "new-password" : "current-password"} required
                minLength={setup ? 12 : undefined} value={password}
                onChange={(event) => setPassword(event.target.value)} className="pr-11" />
              <button type="button" aria-label={showPassword ? "Hide password" : "Show password"}
                onClick={() => setShowPassword((value) => !value)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
            {setup && <p className="text-xs text-muted-foreground">Use at least 12 characters. Keep this password somewhere safe.</p>}
          </div>
          {setup && <div className="space-y-2">
            <Label htmlFor="auth-confirm">Confirm password</Label>
            <Input id="auth-confirm" type="password" autoComplete="new-password" required
              value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} />
          </div>}
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Please wait…" : setup ? "Create account" : "Sign in"}
          </Button>
        </form>
      </div>
    </main>
  );
}
