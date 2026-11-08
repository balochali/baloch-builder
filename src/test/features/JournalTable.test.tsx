import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import type { JournalRow } from "@baloch/shared";
import { JournalTable } from "@/features/projects/FundingUI";

it("groups a voucher by default and shows its narration only once", () => {
  const base = {
    voucherId: "JV-0001",
    date: "2026-11-08",
    narration: "Partner contribution",
    status: "posted",
    type: "regular",
  } as const;
  const lines: JournalRow[] = [
    { ...base, id: "one", accountCode: "1010", accountName: "Bank", debit: 10000, credit: 0 },
    { ...base, id: "two", accountCode: "3000", accountName: "Capital", debit: 0, credit: 10000 },
  ];
  render(<JournalTable lines={lines} />);
  const group = screen.getByRole("checkbox", { name: "Group by voucher" });
  expect(group).toBeChecked();
  expect(screen.getAllByText(/Partner contribution/)).toHaveLength(1);
  expect(screen.getAllByText(String.fromCodePoint(0x2014))).toHaveLength(4);
  fireEvent.click(group);
  expect(screen.getAllByText(/Partner contribution/)).toHaveLength(1);
});
