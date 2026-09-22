import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import { AppShell } from "./layout/AppShell";
import { AuthPage } from "@/features/auth/AuthPage";

// Feature pages
import { DashboardPage } from "@/features/dashboard/pages/DashboardPage";
import { ContactsPage } from "@/features/contacts/pages/ContactsPage";
import { LandComingSoonPage } from "@/features/land/pages/ComingSoon";
import { ProjectsPage } from "@/features/projects/pages/ProjectsPage";
import { PartnersComingSoonPage } from "@/features/partners/pages/ComingSoon";
import { LedgerComingSoonPage } from "@/features/ledger/pages/ComingSoon";
import { DocumentsComingSoonPage } from "@/features/documents/pages/ComingSoon";
import { SettingsPage } from "@/features/settings/pages/SettingsPage";

export function AppRouter() {
  const [auth, setAuth] = useState<"loading" | "setup" | "login" | "ready" | "error">("loading");

  useEffect(() => {
    let active = true;
    invoke<boolean>("auth_status")
      .then((exists) => { if (active) setAuth(exists ? "login" : "setup"); })
      .catch(() => { if (active) setAuth("error"); });
    return () => { active = false; };
  }, []);

  if (auth === "loading") return <div className="min-h-screen grid place-items-center">Opening Baloch Builder…</div>;
  if (auth === "error") return <div className="min-h-screen grid place-items-center text-destructive">Unable to load account. Restart the desktop app.</div>;
  if (auth !== "ready") return <AuthPage mode={auth} onSuccess={() => setAuth("ready")} />;

  return (
    <HashRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/contacts" element={<ContactsPage />} />
          <Route path="/land" element={<LandComingSoonPage />} />
          <Route path="/projects" element={<ProjectsPage />} />
          <Route path="/partners" element={<PartnersComingSoonPage />} />
          <Route path="/ledger" element={<LedgerComingSoonPage />} />
          <Route path="/documents" element={<DocumentsComingSoonPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          {/* Catch-all */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
