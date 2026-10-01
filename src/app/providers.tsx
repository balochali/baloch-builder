import { useEffect, type ReactNode } from "react";
import { Toaster } from "sonner";
import { useThemeStore, applyTheme } from "@/stores/themeStore";

interface ProvidersProps {
  children: ReactNode;
}

export function Providers({ children }: ProvidersProps) {
  const { theme } = useThemeStore();

  // Apply theme on mount and whenever it changes
  useEffect(() => {
    applyTheme(theme);
    if (theme !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => applyTheme("system");
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [theme]);

  return (
    <>
      {children}
      <Toaster richColors position="bottom-right" />
    </>
  );
}
