import { useEffect, useState, useRef, lazy, Suspense } from "react";
import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import { can, type Permission } from "@baloch/shared";
import { api, SESSION_EXPIRED_EVENT, SESSION_EXPIRED_MESSAGE } from "@/data/api";
import type { SessionUser } from "@/data/session";
import { AuthPage } from "@/features/auth/AuthPage";
import { AppShell } from "./layout/AppShell";
const AccountingPage = lazy(() =>
  import("@/features/accounting/AccountingPage").then((m) => ({ default: m.AccountingPage })),
);
const LegacyRouter = lazy(() => import("./LegacyRouter").then((m) => ({ default: m.AppRouter })));
const screens: [string, Permission][] = [
  ["projects", "projects"],
  ["vouchers", "ledger"],
  ["journal", "ledger"],
  ["trial-balance", "ledger"],
  ["accounts", "accounts"],
  ["periods", "periods"],
  ["users", "users"],
  ["assignments", "users"],
  ["audit", "audit"],
  ["settings", "settings"],
];
function ServerRouter() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sessionError, setSessionError] = useState("");
  const authenticated = useRef(false);
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
    api<SessionUser>("me")
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
        {sessionError && <p role="alert">{sessionError}</p>}
        <AuthPage
          mode="login"
          onSuccess={() => {}}
          authenticate={async (username, password, totp) => {
            const u = await api<SessionUser>("login", "POST", {
              email: username,
              password,
              ...(totp ? { totp } : {}),
            });
            authenticated.current = true;
            setSessionError("");
            setUser(u);
          }}
        />
      </>
    );
  return (
    <HashRouter>
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
          <Route path="/" element={<Navigate to="/projects" replace />} />
          {screens
            .filter(([, permission]) => can(user.role, permission))
            .map(([screen]) => (
              <Route
                key={screen}
                path={`/${screen}`}
                element={
                  <>
                    {error && <p role="alert">{error}</p>}
                    <Suspense fallback={<p>Loading records…</p>}>
                      <AccountingPage key={screen} screen={screen} user={user} />
                    </Suspense>
                  </>
                }
              />
            ))}
          <Route path="*" element={<Navigate to="/projects" replace />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
export function AppRouter() {
  return import.meta.env.MODE === "legacy" ? (
    <Suspense fallback={<p>Opening Baloch Builder…</p>}>
      <LegacyRouter />
    </Suspense>
  ) : (
    <ServerRouter />
  );
}
