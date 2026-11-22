import { useState, type FormEvent } from "react";
import { api } from "@/data/api";
export function FirstRunSetup({
  onDone,
}: {
  onDone: (username: string, password: string) => Promise<void>;
}) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.currentTarget));
    setBusy(true);
    setError("");
    try {
      await api("setup", "POST", data);
      await onDone(String(data.username), String(data.password));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="min-h-screen grid place-items-center p-6">
      <form
        onSubmit={submit}
        className="w-full max-w-lg rounded-xl border border-border bg-card p-6 space-y-4"
      >
        <h1 className="text-2xl font-bold">Welcome to Baloch Builder</h1>
        <p>Create your administrator account. Your records stay on this computer.</p>
        {[
          ["companyName", "Company name"],
          ["fullName", "Your full name"],
          ["username", "Username"],
          ["email", "Email"],
          ["password", "Password"],
          ["confirm", "Confirm password"],
        ].map(([name, label]) => (
          <label className="block" key={name}>
            {label}
            <input
              className="block w-full rounded border border-border bg-background p-2"
              name={name}
              required
              type={
                name === "email"
                  ? "email"
                  : name === "password" || name === "confirm"
                    ? "password"
                    : "text"
              }
              minLength={name === "password" ? 12 : undefined}
              autoComplete={
                name === "password" || name === "confirm"
                  ? "new-password"
                  : name === "username"
                    ? "username"
                    : "off"
              }
            />
          </label>
        ))}
        <p>Use at least 12 characters for your password.</p>
        {error && <p role="alert">{error}</p>}
        <button className="projects-primary" disabled={busy}>
          {busy ? "Creating your account…" : "Create administrator"}
        </button>
      </form>
    </main>
  );
}
