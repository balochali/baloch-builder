import { Outlet, useLocation } from "react-router-dom";
import { Building2 } from "lucide-react";
import { Sidebar } from "./Sidebar";

export function AppShell() {
  const { pathname } = useLocation();
  const section = pathname.startsWith("/projects/") ? "Project details" :
    ({ "/": "Dashboard", "/contacts": "Contacts", "/land": "Land", "/projects": "Projects",
      "/partners": "Partners", "/personal-expense": "Personal Expense",
      "/credit-udhaar": "Credit / Udhaar", "/settings": "Settings" } as Record<string, string>)[pathname] ?? "Workspace";
  return (
    <div className="app-shell flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex flex-col flex-1 overflow-hidden">
        <header className="app-topbar">
          <div><span>WORKSPACE / {section.toUpperCase()}</span><strong>Baloch Builders & Developers</strong></div>
          <div className="app-topbar-mark" aria-hidden="true"><Building2 size={19} /></div>
        </header>
        <main className="app-main flex-1 overflow-y-auto p-6 bg-background">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
