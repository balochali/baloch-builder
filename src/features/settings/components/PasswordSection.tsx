import { useState, type FormEvent } from "react";
import { KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { errorText, settingsApi } from "../api";
import "../settings-account.css";

export const MIN_PASSWORD_LENGTH = 12;

/** Returns a message for the first problem found, or an empty string when the form is valid. */
export function passwordProblem(current: string, next: string, confirm: string): string {
    if (!current) return "Enter your current password.";
    if (Array.from(next).length < MIN_PASSWORD_LENGTH) {
        return `Use a new password of at least ${MIN_PASSWORD_LENGTH} characters.`;
    }
    if (next !== confirm) return "The new passwords do not match.";
    if (next === current) return "Choose a password that is different from your current one.";
    return "";
}

export function PasswordSection() {
    const [current, setCurrent] = useState("");
    const [next, setNext] = useState("");
    const [confirm, setConfirm] = useState("");
    const [show, setShow] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [done, setDone] = useState(false);

    async function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (busy) return;
        setDone(false);
        const problem = passwordProblem(current, next, confirm);
        if (problem) {
            setError(problem);
            return;
        }
        setBusy(true);
        setError("");
        try {
            await settingsApi.changePassword(current, next);
            setCurrent("");
            setNext("");
            setConfirm("");
            setDone(true);
        } catch (cause) {
            setError(errorText(cause));
        } finally {
            setBusy(false);
        }
    }

    const type = show ? "text" : "password";
    return (
        <section className="settings-section" aria-labelledby="password-heading">
            <KeyRound size={24} />
            <h2 id="password-heading">Change password</h2>
            <p>
                Choose a new password of at least {MIN_PASSWORD_LENGTH} characters. There is no password
                recovery, so keep it somewhere safe.
            </p>
            <form className="settings-form" onSubmit={submit}>
                <div className="settings-field">
                    <Label htmlFor="password-current">Current password</Label>
                    <Input
                        id="password-current"
                        type={type}
                        value={current}
                        autoComplete="current-password"
                        onChange={(event) => setCurrent(event.target.value)}
                        disabled={busy}
                    />
                </div>
                <div className="settings-field">
                    <Label htmlFor="password-new">New password</Label>
                    <Input
                        id="password-new"
                        type={type}
                        value={next}
                        autoComplete="new-password"
                        onChange={(event) => setNext(event.target.value)}
                        disabled={busy}
                    />
                </div>
                <div className="settings-field">
                    <Label htmlFor="password-confirm">Confirm new password</Label>
                    <Input
                        id="password-confirm"
                        type={type}
                        value={confirm}
                        autoComplete="new-password"
                        onChange={(event) => setConfirm(event.target.value)}
                        disabled={busy}
                    />
                </div>
                <label className="settings-check">
                    <input type="checkbox" checked={show} onChange={(event) => setShow(event.target.checked)} />
                    Show passwords
                </label>
                {error && (
                    <p role="alert" className="settings-message settings-message-error">
                        {error}
                    </p>
                )}
                {done && (
                    <p role="status" className="settings-message settings-message-ok">
                        Your password has been changed. Use the new one the next time you sign in.
                    </p>
                )}
                <div className="settings-actions">
                    <Button type="submit" disabled={busy}>
                        {busy ? "Changing…" : "Change password"}
                    </Button>
                </div>
            </form>
        </section>
    );
}