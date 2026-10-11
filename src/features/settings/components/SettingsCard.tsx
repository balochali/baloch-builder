import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import "../settings-account.css";

export type BadgeTone = "ok" | "warn" | "bad" | "muted";

interface SettingsCardProps {
    /** Used for the menu link target (`settings-<id>`) and the heading id. */
    id: string;
    icon: LucideIcon;
    title: string;
    description?: string;
    badge?: { text: string; tone: BadgeTone };
    danger?: boolean;
    /** Set when the body supplies its own padding (for example the danger zone rows). */
    bodyClassName?: string;
    children: ReactNode;
}

/** One titled card of the Settings page: icon, title, short explanation and an optional status badge. */
export function SettingsCard({
    id,
    icon: Icon,
    title,
    description,
    badge,
    danger,
    bodyClassName = "sx-card-body",
    children,
}: SettingsCardProps) {
    return (
        <section
            id={`settings-${id}`}
            className={danger ? "sx-card sx-card-danger" : "sx-card"}
            aria-labelledby={`${id}-heading`}
        >
            <header className="sx-card-head">
                <span className="sx-icon" aria-hidden="true">
                    <Icon size={20} />
                </span>
                <div>
                    <h2 id={`${id}-heading`}>{title}</h2>
                    {description && <p>{description}</p>}
                </div>
                {badge && <span className={`sx-badge sx-badge-${badge.tone}`}>{badge.text}</span>}
            </header>
            <div className={bodyClassName}>{children}</div>
        </section>
    );
}