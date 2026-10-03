import { Outlet, useLocation, Link } from "react-router-dom";
import { ChevronRight, CalendarDays, Sun, Moon } from "lucide-react";
import { Sidebar } from "./Sidebar";
import { useThemeStore } from "@/stores/themeStore";

export function AppShell() {
  const { pathname } = useLocation();
  const { theme, setTheme } = useThemeStore();
  const section = pathname.startsWith("/projects/")
    ? "Project details"
    : ((
        {
          "/": "Dashboard",
          "/contacts": "Contacts",
          "/land": "Land",
          "/documents": "Documents",
          "/projects": "Projects",
          "/partners": "Partners",
          "/personal-expense": "Personal Expense",
          "/credit-udhaar": "Credit / Udhaar",
          "/bank": "Bank",
          "/settings": "Settings",
        } as Record<string, string>
      )[pathname] ?? "Workspace");
  return (
    <div className="app-shell">
      <a
        href="#workspace-content"
        className="skip-link"
        onClick={(event) => {
          event.preventDefault();
          document.getElementById("workspace-content")?.focus();
        }}
      >
        Skip to content
      </a>
      <Sidebar />
      <div className="app-workspace">
        <header className="app-topbar">
          <div className="workspace-breadcrumb">
            <Link to="/">Workspace</Link>
            <ChevronRight size={14} />
            {pathname.startsWith("/projects/") && (
              <>
                <Link to="/projects">Projects</Link>
                <ChevronRight size={14} />
              </>
            )}
            <strong>{section}</strong>
          </div>
          <div className="topbar-tools">
            <span className="workspace-date">
              <CalendarDays size={15} />
              {new Date().toLocaleDateString("en-GB", {
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
            </span>
            <button
              type="button"
              className="theme-toggle"
              aria-label={theme === "dark" ? "Use light theme" : "Use dark theme"}
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            >
              {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <span className="workspace-avatar" aria-label="Baloch Builders">
              BB
            </span>
          </div>
        </header>
        <main key={pathname} id="workspace-content" tabIndex={-1} className="app-main">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
