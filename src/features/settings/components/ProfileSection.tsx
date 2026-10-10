import { useState, type FormEvent } from "react";
import { UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { errorText, settingsApi, type Profile } from "../api";
import "../settings-account.css";

interface ProfileSectionProps {
    profile: Profile;
    onSaved: (profile: Profile) => void;
}

export function ProfileSection({ profile, onSaved }: ProfileSectionProps) {
    const [fullName, setFullName] = useState(profile.fullName);
    const [email, setEmail] = useState(profile.email);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [saved, setSaved] = useState(false);
    const unchanged = fullName.trim() === profile.fullName && email.trim() === profile.email;

    async function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (busy || unchanged) return;
        setBusy(true);
        setError("");
        setSaved(false);
        try {
            const updated = await settingsApi.updateProfile(fullName, email);
            setFullName(updated.fullName);
            setEmail(updated.email);
            onSaved(updated);
            setSaved(true);
        } catch (cause) {
            setError(errorText(cause));
        } finally {
            setBusy(false);
        }
    }

    return (
        <section className="settings-section" aria-labelledby="profile-heading">
            <UserRound size={24} />
            <h2 id="profile-heading">Your details</h2>
            <p>These details are kept on this computer and shown on the Settings page.</p>
            <form className="settings-form" onSubmit={submit} noValidate>
                <div className="settings-field">
                    <Label htmlFor="profile-username">Username</Label>
                    <Input id="profile-username" value={profile.username} readOnly disabled />
                    <small>Your username is used to sign in and cannot be changed here.</small>
                </div>
                <div className="settings-field">
                    <Label htmlFor="profile-full-name">Full name</Label>
                    <Input
                        id="profile-full-name"
                        value={fullName}
                        maxLength={100}
                        autoComplete="name"
                        placeholder="For example, Ali Baloch"
                        onChange={(event) => {
                            setFullName(event.target.value);
                            setSaved(false);
                        }}
                        disabled={busy}
                    />
                </div>
                <div className="settings-field">
                    <Label htmlFor="profile-email">Email</Label>
                    <Input
                        id="profile-email"
                        type="email"
                        value={email}
                        maxLength={254}
                        autoComplete="email"
                        placeholder="name@example.com"
                        onChange={(event) => {
                            setEmail(event.target.value);
                            setSaved(false);
                        }}
                        disabled={busy}
                    />
                    <small>Optional. For your records only. Backups go to the Google account you connect.</small>
                </div>
                {error && (
                    <p role="alert" className="settings-message settings-message-error">
                        {error}
                    </p>
                )}
                {saved && (
                    <p role="status" className="settings-message settings-message-ok">
                        Your details have been saved.
                    </p>
                )}
                <div className="settings-actions">
                    <Button type="submit" disabled={busy || unchanged}>
                        {busy ? "Saving…" : "Save details"}
                    </Button>
                </div>
            </form>
        </section>
    );
}