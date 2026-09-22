import { Moon, Sun, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useThemeStore, applyTheme } from "@/stores/themeStore";

export function TopBar() {
  const { theme, setTheme } = useThemeStore();

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    applyTheme(next);
  }

  return (
    <header className="h-14 flex items-center justify-between px-6 border-b bg-background shrink-0">
      {/* Search placeholder */}
      <div className="flex items-center gap-2 text-muted-foreground text-sm">
        <Search className="size-4" />
        <span>Search (coming soon)</span>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        {/* "+ Add" placeholder — context-specific add is handled per page */}
        <Button id="topbar-add" variant="default" size="sm" disabled>
          <Plus className="size-4" />
          Add
        </Button>

        <Button
          id="topbar-theme-toggle"
          variant="ghost"
          size="icon"
          onClick={toggleTheme}
          aria-label="Toggle theme"
        >
          {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
        </Button>
      </div>
    </header>
  );
}
