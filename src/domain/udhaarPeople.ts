import type { Udhaar } from "@/data/repositories/udhaarRepository";

export type UdhaarPerson = Udhaar & { loans: Udhaar[] };
const normalizedPhone = (phone: string | null) => {
  const digits = (phone ?? "").replace(/\D/g, "").replace(/^0092/, "92");
  return digits.startsWith("92") && digits.length === 12 ? "0" + digits.slice(2) : digits;
};

/** Group linked contacts and legacy entries with the same name AND phone. */
export function groupUdhaarPeople(records: Udhaar[]): UdhaarPerson[] {
  const groups: Udhaar[][] = [];
  for (const record of records) {
    const matches = groups.filter((group) =>
      group.some(
        (other) =>
          (record.contact_id && record.contact_id === other.contact_id) ||
          (normalizedPhone(record.phone) &&
            normalizedPhone(record.phone) === normalizedPhone(other.phone) &&
            record.borrower_name.trim().toLocaleLowerCase() ===
              other.borrower_name.trim().toLocaleLowerCase()),
      ),
    );
    if (!matches.length) groups.push([record]);
    else {
      matches[0].push(record);
      for (const extra of matches.slice(1)) {
        matches[0].push(...extra);
        groups.splice(groups.indexOf(extra), 1);
      }
    }
  }
  return groups
    .map((loans) => {
      const sorted = [...loans].sort((a, b) => b.given_date.localeCompare(a.given_date));
      const dueDates = loans
        .filter((loan) => loan.amount > loan.paid_amount && loan.due_date)
        .map((loan) => loan.due_date!)
        .sort();
      return {
        ...sorted[0],
        id: loans.map((loan) => loan.id).sort()[0],
        loans: sorted,
        amount: loans.reduce((sum, loan) => sum + loan.amount, 0),
        paid_amount: loans.reduce((sum, loan) => sum + loan.paid_amount, 0),
        payment_count: loans.reduce((sum, loan) => sum + loan.payment_count, 0),
        notes: loans
          .map((loan) => loan.notes)
          .filter(Boolean)
          .join(" · "),
        due_date: dueDates[0] ?? null,
      };
    })
    .sort((a, b) => b.given_date.localeCompare(a.given_date));
}
