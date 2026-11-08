import { useState, type FormEvent } from "react";

import { api, SESSION_EXPIRED_EVENT } from "@/data/api";

export function ChangePassword() {
  const [currentPassword, setCurrent] = useState("");

  const [newPassword, setNew] = useState("");

  const [confirm, setConfirm] = useState("");

  const [error, setError] = useState("");

  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();

    setError("");

    if (newPassword !== confirm) {
      setError("Passwords do not match.");
      return;
    }

    setPending(true);

    try {
      await api("change-password", "POST", { currentPassword, newPassword });

      localStorage.setItem("baloch:locked", "1");

      window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
    } catch (e) {
      setError(String(e));
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="settings-card">
      <h2>Change password</h2>

      <form onSubmit={submit} className="toolbar">
        <label>
          Current password
          <input
            type="password"
            autoComplete="current-password"
            required
            value={currentPassword}
            onChange={(e) => setCurrent(e.target.value)}
          />
        </label>

        <label>
          New password
          <input
            type="password"
            autoComplete="new-password"
            minLength={12}
            maxLength={256}
            required
            value={newPassword}
            onChange={(e) => setNew(e.target.value)}
          />
        </label>

        <label>
          Confirm new password
          <input
            type="password"
            autoComplete="new-password"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </label>

        <p>Use at least 12 characters. Changing your password signs out all sessions.</p>

        {error && <p role="alert">{error}</p>}

        <button disabled={pending}>{pending ? "Saving…" : "Change password"}</button>
      </form>
    </section>
  );
}
