import { expect, it } from "vitest";
import { groupUdhaarPeople } from "@/domain/udhaarPeople";
const base = {
  borrower_name: "Ali",
  phone: "03128989908",
  amount: 240000,
  paid_amount: 0,
  payment_count: 0,
  given_date: "2026-09-26",
  due_date: null,
  notes: null,
  created_at: "",
};
it("combines Ali's legacy loans and normalizes Pakistani phone formatting", () => {
  const people = groupUdhaarPeople([
    { ...base, id: "a" },
    {
      ...base,
      id: "b",
      phone: "+92 312 8989908",
      amount: 430000,
      paid_amount: 30000,
      payment_count: 1,
    },
  ]);
  expect(people).toHaveLength(1);
  expect(people[0]).toMatchObject({ amount: 670000, paid_amount: 30000, payment_count: 1 });
  expect(people[0].loans).toHaveLength(2);
});
it("groups by contact identity while keeping unrelated people with the same name separate", () => {
  expect(
    groupUdhaarPeople([
      { ...base, id: "a", contact_id: "c", phone: null },
      { ...base, id: "b", contact_id: "c", phone: null },
    ]),
  ).toHaveLength(1);
  expect(
    groupUdhaarPeople([
      { ...base, id: "a", phone: null },
      { ...base, id: "b", phone: null },
      { ...base, id: "c" },
    ]),
  ).toHaveLength(3);
});
