import { ChartAccounts } from "@/features/projects/ChartAccounts";
import { PartnersMaster } from "@/features/projects/PartnersMaster";
import { ProjectDetail } from "@/features/projects/ProjectDetail";
import { ProjectsPage } from "@/features/projects/ProjectsPage";
import { useEffect, useState, useRef } from "react";
import { HashRouter, Routes, Route, Navigate, NavLink } from "react-router-dom";
import { can } from "@baloch/shared";
import { api, SESSION_EXPIRED_EVENT, SESSION_EXPIRED_MESSAGE } from "@/data/api";
import { useSessionLock, waitForSessionLogout } from "@/features/auth/useSessionLock";
import type { SessionUser } from "@/data/session";
import { AuthPage } from "@/features/auth/AuthPage";
import { DashboardWelcome } from "@/features/dashboard/DashboardWelcome";
import { AppShell } from "./layout/AppShell";
import { navigation } from "./navigation";
const screens = navigation.flatMap((group) => [...group.items]);
function ServerRouter() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sessionError, setSessionError] = useState("");
  const authenticated = useRef(false);
  useSessionLock(Boolean(user), () => {
    authenticated.current = false;
    setUser(null);
    setSessionError("Your workspace was locked. Please sign in again.");
  });
  useEffect(() => {
    let active = true;
    const expire = () => {
      if (authenticated.current) setSessionError(SESSION_EXPIRED_MESSAGE);
      authenticated.current = false;
      setUser(null);
      setLoading(false);
      setError("");
    };
    window.addEventListener(SESSION_EXPIRED_EVENT, expire);
    (localStorage.getItem("baloch:locked") ? Promise.reject() : api<SessionUser>("me"))
      .then((u) => {
        if (active) {
          authenticated.current = true;
          setUser(u);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      window.removeEventListener(SESSION_EXPIRED_EVENT, expire);
    };
  }, []);
  if (loading)
    return <div className="min-h-screen grid place-items-center">Opening Baloch Builder…</div>;
  if (!user)
    return (
      <>
        {sessionError && (
          <p
            role="alert"
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              zIndex: 1000,
              margin: 0,
              padding: "0.75rem 1rem",
              background: "var(--card)",
              color: "var(--foreground)",
              borderBottom: "1px solid var(--border)",
              textAlign: "center",
            }}
          >
            {sessionError}
          </p>
        )}
        <AuthPage
          mode="login"
          onSuccess={() => {}}
          authenticate={async (username, password, totp) => {
            await waitForSessionLogout();
            const u = await api<SessionUser>("login", "POST", {
              username,
              password,
              ...(totp ? { totp } : {}),
            });
            localStorage.removeItem("baloch:locked");
            authenticated.current = true;
            setSessionError("");
            window.location.hash = "#/";
            setUser(u);
          }}
        />
      </>
    );
  return (
    <HashRouter>
      {error && <p role="alert">{error}</p>}
      <Routes>
        <Route
          element={
            <AppShell
              role={user.role}
              onLogout={() => {
                void api("logout", "POST")
                  .then(() => {
                    authenticated.current = false;
                    setSessionError("");
                    setUser(null);
                    window.location.hash = "#/";
                  })
                  .catch((e) => setError(String(e)));
              }}
            />
          }
        >
          <Route path="/" element={<DashboardWelcome />} />
          {can(user.role, "projects") && (
            <>
              <Route path="/projects" element={<ProjectsPage role={user.role} />} />
              <Route path="/projects/:id/:tab?" element={<ProjectDetail role={user.role} />} />
            </>
          )}
          {can(user.role, "ledger") && (
            <>
              <Route path="/partners" element={<PartnersMaster role={user.role} />} />
              <Route path="/partners/:partnerId" element={<PartnersMaster role={user.role} />} />
            </>
          )}
          {can(user.role, "accounts") && <Route path="/accounts" element={<ChartAccounts />} />}
          {screens
            .filter(
              (item) =>
                !["/", "/projects", "/partners", "/accounts"].includes(item.to) &&
                can(user.role, item.permission),
            )
            .flatMap((item) => {
              const tabs = [...item.tabs];
              const render = (label: string) => (
                <>
                  {tabs.length > 0 && (
                    <nav
                      aria-label={item.label + " sections"}
                      className="mb-5 flex flex-wrap gap-2 border-b border-border pb-3"
                    >
                      {tabs.map((tab, index) => (
                        <NavLink
                          key={tab.slug}
                          end
                          to={index === 0 ? item.to : item.to + "/" + tab.slug}
                          className={({ isActive }) =>
                            "rounded-lg px-3 py-2 text-sm font-semibold " +
                            (isActive
                              ? "bg-primary text-primary-foreground"
                              : "text-muted-foreground hover:bg-muted")
                          }
                        >
                          {tab.label}
                        </NavLink>
                      ))}
                    </nav>
                  )}
                  <DashboardWelcome title={label} />
                </>
              );
              return [
                <Route key={item.to} path={item.to} element={render(item.label)} />,
                ...tabs.map((tab, index) => (
                  <Route
                    key={item.to + tab.slug}
                    path={item.to + "/" + tab.slug}
                    element={index === 0 ? <Navigate to={item.to} replace /> : render(tab.label)}
                  />
                )),
              ];
            })}
          <Route path="/personal-expense" element={<Navigate to="/personal" replace />} />
          <Route path="/personal-deposit" element={<Navigate to="/personal/deposits" replace />} />
          <Route path="/credit-udhaar" element={<Navigate to="/personal/udhaar" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
export function AppRouter() {
  return <ServerRouter />;
}
