import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import { AppShell } from "./layout/AppShell";

// Feature pages
import { DashboardPage } from "@/features/dashboard/pages/DashboardPage";
import { ContactsPage } from "@/features/contacts/pages/ContactsPage";
import { LandComingSoonPage } from "@/features/land/pages/ComingSoon";
import { ProjectsComingSoonPage } from "@/features/projects/pages/ComingSoon";
import { PartnersComingSoonPage } from "@/features/partners/pages/ComingSoon";
import { LedgerComingSoonPage } from "@/features/ledger/pages/ComingSoon";
import { DocumentsComingSoonPage } from "@/features/documents/pages/ComingSoon";
import { SettingsPage } from "@/features/settings/pages/SettingsPage";

export function AppRouter() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/contacts" element={<ContactsPage />} />
          <Route path="/land" element={<LandComingSoonPage />} />
          <Route path="/projects" element={<ProjectsComingSoonPage />} />
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
