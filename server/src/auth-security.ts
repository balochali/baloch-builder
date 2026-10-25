import { isIP } from "node:net";
import type { FastifyRequest } from "fastify";

export function parseTrustProxy(
  value = process.env.TRUST_PROXY ?? "",
): false | string[] | ((address: string, hop: number) => boolean) {
  const text = value.trim();
  if (!text || text === "off" || text === "false" || text === "0") return false;
  if (/^\d+$/.test(text)) {
    const hops = Number(text);
    if (Number.isSafeInteger(hops) && hops > 0 && hops <= 32) return (_address, hop) => hop < hops;
    throw new Error("TRUST_PROXY hop count must be between 1 and 32");
  }
  const addresses = text.split(",").map((part) => part.trim());
  for (const address of addresses) {
    const [ip, prefix, extra] = address.split("/");
    const version = isIP(ip);
    if (
      !version ||
      extra !== undefined ||
      (prefix !== undefined &&
        (!/^\d+$/.test(prefix) || Number(prefix) > (version === 4 ? 32 : 128)))
    )
      throw new Error(
        "TRUST_PROXY must be off, a hop count, or comma-separated IP addresses/CIDRs",
      );
  }
  return addresses;
}

export function loginEmail(request: FastifyRequest): string {
  const body = request.body;
  if (!body || typeof body !== "object" || !("email" in body) || typeof body.email !== "string")
    return "";
  return body.email.trim().toLowerCase().slice(0, 254);
}
