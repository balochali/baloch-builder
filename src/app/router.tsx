import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import { MapPin, ReceiptText } from "lucide-react";
import { AppShell } from "./layout/AppShell";
import { TemporaryModulePage } from "@/components/TemporaryModulePage";
import { AuthPage } from "@/features/auth/AuthPage";

// Feature pages
import { DashboardPage } from "@/features/dashboard/pages/DashboardPage";
import { ContactsPage } from "@/features/contacts/pages/ContactsPage";
import { ProjectsPage } from "@/features/projects/pages/ProjectsPage";
import { ProjectDetailPage } from "@/features/projects/pages/ProjectDetailPage";
import { PartnersPage } from "@/features/partners/pages/PartnersPage";
import { SettingsPage } from "@/features/settings/pages/SettingsPage";
import { CreditUdhaarPage } from "@/features/udhaar/pages/CreditUdhaarPage";

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
          <Route path="/land" element={<TemporaryModulePage title="Land" icon={MapPin} description="Land records and acquisition details will be available here." />} />
          <Route path="/projects" element={<ProjectsPage />} />
          <Route path="/projects/:projectId" element={<ProjectDetailPage />} />
          <Route path="/partners" element={<PartnersPage />} />
          <Route path="/personal-expense" element={<TemporaryModulePage title="Personal Expense" icon={ReceiptText} description="Personal spending records will be available here." />} />
          <Route path="/credit-udhaar" element={<CreditUdhaarPage />} />
          <Route path="/ledger" element={<Navigate to="/credit-udhaar" replace />} />
          <Route path="/documents" element={<Navigate to="/projects" replace />} />
          <Route path="/settings" element={<SettingsPage />} />
          {/* Catch-all */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
