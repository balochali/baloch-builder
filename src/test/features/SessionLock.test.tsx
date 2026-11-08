import { renderHook, act } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useSessionLock } from "@/features/auth/useSessionLock";
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  localStorage.clear();
});
it("locks immediately when hidden and revokes the server session", () => {
  const fetch = vi.fn().mockResolvedValue({ ok: true });
  vi.stubGlobal("fetch", fetch);
  const lock = vi.fn();
  renderHook(() => useSessionLock(true, lock));
  vi.spyOn(document, "hidden", "get").mockReturnValue(true);
  act(() => document.dispatchEvent(new Event("visibilitychange")));
  expect(lock).toHaveBeenCalledTimes(1);
  expect(localStorage.getItem("baloch:locked")).toBe("1");
  expect(fetch).toHaveBeenCalledWith("/api/logout", expect.objectContaining({ keepalive: true }));
  vi.restoreAllMocks();
});
it("locks after a sleep gap even without a visibility event", () => {
  vi.useFakeTimers();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
  const lock = vi.fn();
  renderHook(() => useSessionLock(true, lock));
  vi.setSystemTime(Date.now() + 60000);
  act(() => vi.advanceTimersByTime(2000));
  expect(lock).toHaveBeenCalledOnce();
});
it("does not lock or send requests when logged out", () => {
  vi.useFakeTimers();
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  const lock = vi.fn();
  renderHook(() => useSessionLock(false, lock));
  act(() => vi.advanceTimersByTime(60000));
  expect(lock).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
});
