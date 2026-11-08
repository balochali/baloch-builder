import { useEffect, useRef } from "react";

let pendingLogout: Promise<unknown> = Promise.resolve();
export function waitForSessionLogout() {
  return pendingLogout;
}

export function useSessionLock(enabled: boolean, onLock: () => void) {
  const callback = useRef(onLock);
  useEffect(() => {
    callback.current = onLock;
  }, [onLock]);
  useEffect(() => {
    if (!enabled) return;
    let locked = false;
    let lastTick = Date.now();
    const lock = () => {
      if (locked) return;
      locked = true;
      localStorage.setItem("baloch:locked", "1");
      callback.current();
      pendingLogout = fetch("/api/logout", {
        method: "POST",
        credentials: "same-origin",
        keepalive: true,
        headers: { "X-Requested-With": "BalochBuilder" },
      }).catch(() => {});
    };
    const check = () => {
      if (Date.now() - lastTick > 15000 || localStorage.getItem("baloch:locked")) lock();
      lastTick = Date.now();
    };
    const visibility = () => {
      if (document.hidden) lock();
      else check();
    };
    const storage = (event: StorageEvent) => {
      if (event.key === "baloch:locked" && event.newValue) lock();
    };
    const timer = window.setInterval(check, 2000);
    const heartbeat = window.setInterval(() => {
      check();
      if (!locked)
        void fetch("/api/heartbeat", {
          method: "POST",
          credentials: "same-origin",
          headers: { "X-Requested-With": "BalochBuilder" },
        })
          .then((r) => {
            if (!r.ok) lock();
          })
          .catch(lock);
    }, 5000);
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("focus", check);
    window.addEventListener("pagehide", lock);
    window.addEventListener("storage", storage);
    if (document.hidden) lock();
    return () => {
      clearInterval(timer);
      clearInterval(heartbeat);
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("focus", check);
      window.removeEventListener("pagehide", lock);
      window.removeEventListener("storage", storage);
    };
  }, [enabled]);
}
