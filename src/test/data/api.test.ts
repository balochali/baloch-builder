import { afterEach, describe, expect, it, vi } from "vitest";
import { api, SESSION_EXPIRED_EVENT, SESSION_EXPIRED_MESSAGE } from "@/data/api";

afterEach(() => vi.unstubAllGlobals());
const respond = (body: string | null, status = 200, statusText = "") =>
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(body, { status, statusText })));
describe("api response handling", () => {
  it("notifies the router even for an empty 401", async () => {
    respond(null, 401);
    const listener = vi.fn();
    window.addEventListener(SESSION_EXPIRED_EVENT, listener);
    try {
      await expect(api("accounts")).rejects.toThrow(SESSION_EXPIRED_MESSAGE);
      expect(listener).toHaveBeenCalledOnce();
    } finally {
      window.removeEventListener(SESSION_EXPIRED_EVENT, listener);
    }
  });
  it("keeps login errors on the login form", async () => {
    respond('{"error":"Invalid credentials"}', 401);
    const listener = vi.fn();
    window.addEventListener(SESSION_EXPIRED_EVENT, listener);
    try {
      await expect(api("login", "POST", {})).rejects.toThrow("Invalid credentials");
      expect(listener).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener(SESSION_EXPIRED_EVENT, listener);
    }
  });
  it("handles proxy HTML errors without displaying the HTML", async () => {
    respond("<html>proxy failure</html>", 502, "Bad Gateway");
    await expect(api("projects")).rejects.toThrow(
      "Request failed (502 Bad Gateway). Please try again.",
    );
  });
  it("handles empty error responses", async () => {
    respond(null, 503);
    await expect(api("projects")).rejects.toThrow("Request failed (503)");
  });
  it("accepts empty successful responses", async () => {
    respond(null, 204);
    await expect(api("logout", "POST")).resolves.toBeUndefined();
  });
  it("reports malformed successful JSON", async () => {
    respond("not-json");
    await expect(api("projects")).rejects.toThrow("unreadable response");
  });
  it("reports network failures clearly", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));
    await expect(api("projects")).rejects.toThrow("Unable to reach the server");
  });
});
