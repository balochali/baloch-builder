import { useEffect, useState } from "react";
import "../settings-account.css";

export interface SettingsNavItem {
    id: string;
    label: string;
}

interface SettingsNavProps {
    items: SettingsNavItem[];
}

/** Side menu that jumps to a section and highlights the one currently on screen. */
export function SettingsNav({ items }: SettingsNavProps) {
    const [active, setActive] = useState(items[0]?.id ?? "");
    const key = items.map((item) => item.id).join("|");

    useEffect(() => {
        if (typeof IntersectionObserver === "undefined") return;
        const observer = new IntersectionObserver(
            (entries) => {
                const visible = entries.find((entry) => entry.isIntersecting);
                if (visible) setActive(visible.target.id.replace("settings-", ""));
            },
            { rootMargin: "-15% 0px -70% 0px" },
        );
        for (const id of key.split("|")) {
            const element = document.getElementById(`settings-${id}`);
            if (element) observer.observe(element);
        }
        return () => observer.disconnect();
    }, [key]);

    function jump(id: string) {
        setActive(id);
        document
            .getElementById(`settings-${id}`)
            ?.scrollIntoView?.({ behavior: "smooth", block: "start" });
    }

    return (
        <nav className="sx-nav" aria-label="Settings sections">
            {items.map((item) => (
                <button
                    key={item.id}
                    type="button"
                    aria-current={active === item.id ? "true" : undefined}
                    onClick={() => jump(item.id)}
                >
                    {item.label}
                </button>
            ))}
        </nav>
    );
}