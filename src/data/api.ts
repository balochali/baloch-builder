export const SESSION_EXPIRED_EVENT = "baloch:session-expired";
export const SESSION_EXPIRED_MESSAGE = "Your session has expired. Please sign in again.";

export async function api<T = unknown>(url: string, method = "GET", data?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api/${url}`, {
      method,
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", "X-Requested-With": "BalochBuilder" },
      body: data === undefined ? undefined : JSON.stringify(data),
    });
  } catch {
    throw new Error("Unable to reach the server. Please try again.");
  }
  if (response.status === 401 && url.split("?")[0] !== "login") {
    window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
    throw new Error(SESSION_EXPIRED_MESSAGE);
  }
  const text = await response.text();
  let result: unknown;
  if (text.trim()) {
    try {
      result = JSON.parse(text);
    } catch {
      throw new Error(
        response.ok
          ? "The server returned an unreadable response. Please try again."
          : `Request failed (${response.status}${response.statusText ? ` ${response.statusText}` : ""}). Please try again.`,
      );
    }
  }
  if (!response.ok) {
    const message =
      result && typeof result === "object" && "error" in result && typeof result.error === "string"
        ? result.error
        : `Request failed (${response.status}). Please try again.`;
    throw new Error(message);
  }
  return result as T;
}
