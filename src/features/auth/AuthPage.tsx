import { useState, type FormEvent } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ArrowRight, Building2, Eye, EyeOff, LockKeyhole, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import towersImage from "@/assets/auth/residential-towers.png";
import "./auth-page.css";

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
    <main className="auth-page">
      <div className="auth-shell">
        <section className="auth-visual" aria-label="Modern residential buildings">
          <img src={towersImage} alt="Tall residential towers in warm evening light" />
          <div className="auth-visual-shade" />
          <div className="auth-visual-top">
            <span className="auth-visual-logo"><Building2 aria-hidden="true" /></span>
            <span><strong>BALOCH</strong><small>BUILDERS & DEVELOPERS</small></span>
          </div>
          <div className="auth-visual-copy">
            <span className="auth-visual-eyebrow">BUILT FOR THE WAY YOU BUILD</span>
            <h2>Every project begins with a clear plan.</h2>
            <p>Keep your projects, people and finances together in one workspace.</p>
          </div>
          <span className="auth-visual-caption">YOUR BUILDING WORKSPACE</span>
        </section>

        <section className="auth-form-side">
          <div className="auth-mobile-brand"><Building2 aria-hidden="true" /> BALOCH <span>BUILDERS & DEVELOPERS</span></div>
          <div className="auth-panel">
            <div className="auth-form-icon"><LockKeyhole aria-hidden="true" /></div>
            <span className="auth-form-eyebrow">YOUR PRIVATE WORKSPACE</span>
            <h1>{setup ? "Set up your account" : "Welcome back"}</h1>
            <p className="auth-form-intro">
              {setup ? "Create your login to start managing your building work." : "Sign in to continue managing your building work."}
            </p>

            <form onSubmit={submit}>
              <div className="auth-field">
                <Label htmlFor="auth-username">Username</Label>
                <Input id="auth-username" placeholder="Enter your username" autoComplete="username" autoFocus required minLength={3}
                  maxLength={64} value={username} onChange={(event) => setUsername(event.target.value)} />
              </div>
              <div className="auth-field">
                <Label htmlFor="auth-password">Password</Label>
                <div className="auth-password-wrap">
                  <Input id="auth-password" type={showPassword ? "text" : "password"} placeholder="Enter your password"
                    autoComplete={setup ? "new-password" : "current-password"} required
                    minLength={setup ? 12 : undefined} value={password}
                    onChange={(event) => setPassword(event.target.value)} />
                  <button type="button" aria-label={showPassword ? "Hide password" : "Show password"}
                    onClick={() => setShowPassword((value) => !value)}>
                    {showPassword ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
                  </button>
                </div>
                {setup && <p className="auth-field-hint">Use at least 12 characters.</p>}
              </div>
              {setup && <div className="auth-field">
                <Label htmlFor="auth-confirm">Confirm password</Label>
                <Input id="auth-confirm" type="password" placeholder="Enter your password again" autoComplete="new-password" required
                  value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} />
              </div>}
              {error && <p role="alert" className="auth-error">{error}</p>}
              <Button type="submit" disabled={pending}>
                {pending ? "Please wait…" : setup ? "Create account" : "Sign in"}
                {!pending && <ArrowRight aria-hidden="true" />}
              </Button>
            </form>
            <div className="auth-form-footer"><ShieldCheck aria-hidden="true" /><span>Your records stay on this device.</span></div>
          </div>
          <p className="auth-side-footer">Baloch Builders & Developers</p>
        </section>
      </div>
    </main>
  );
}
