export async function api<T = unknown>(url: string, method = "GET", data?: unknown): Promise<T> {
  const r = await fetch(`/api/${url}`, {
    method,
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", "X-Requested-With": "BalochBuilder" },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  const result = await r.json();
  if (!r.ok) throw new Error(result.error ?? "Request failed");
  return result as T;
}
