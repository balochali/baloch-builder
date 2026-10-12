import { Outlet, useLocation, Link } from "react-router-dom";
import { useRef, useState } from "react";
import { ChevronRight, CalendarDays, Sun, Moon, Menu } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Sidebar } from "./Sidebar";
import { useThemeStore } from "@/stores/themeStore";

interface AppShellProps {
  onLogout: () => void;
}

export function AppShell({ onLogout }: AppShellProps) {
  const [navigationOpen, setNavigationOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
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
          "/personal-deposit": "Personal Deposit / Amanat",
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
      <Sidebar onLogout={onLogout} />
      <Dialog open={navigationOpen} onOpenChange={setNavigationOpen}>
        <DialogContent
          className="mobile-navigation"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            menuButton.current?.focus();
          }}
        >
          <DialogTitle className="sr-only">Workspace navigation</DialogTitle>
          <DialogDescription className="sr-only">
            Choose a page in your workspace.
          </DialogDescription>
          <Sidebar
            onNavigate={() => setNavigationOpen(false)}
            onLogout={() => {
              setNavigationOpen(false);
              onLogout();
            }}
          />
        </DialogContent>
      </Dialog>
      <div className="app-workspace">
        <header className="app-topbar">
          <div className="topbar-location">
            <button
              type="button"
              ref={menuButton}
              className="mobile-menu-toggle"
              aria-label="Open navigation"
              aria-haspopup="dialog"
              aria-expanded={navigationOpen}
              onClick={() => setNavigationOpen(true)}
            >
              <Menu size={20} />
            </button>
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
