import { format, parseISO, isValid } from "date-fns";

/** Format an ISO date string to a readable date (DD MMM YYYY) */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = parseISO(iso);
  return isValid(d) ? format(d, "dd MMM yyyy") : "—";
}

/** Return current time as ISO string */
export function nowISO(): string {
  return new Date().toISOString();
}
