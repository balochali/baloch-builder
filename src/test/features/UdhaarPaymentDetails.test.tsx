import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { UdhaarPaymentDetails } from "@/components/UdhaarPaymentDetails";
import { emptyPaymentDetails, PaymentDetailsSchema } from "@/domain/udhaarPaymentDetails";
it("reveals only relevant fields and clears hidden method details", () => {
  function Form() { const [value, setValue] = useState(emptyPaymentDetails); return <UdhaarPaymentDetails value={value} onChange={setValue} />; }
  render(<Form />);
  expect(screen.queryByLabelText("Bank name *")).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Received by *"), { target: { value: "Ali" } });
  fireEvent.click(screen.getByRole("button", { name: "Digital wallet" }));
  fireEvent.change(screen.getByLabelText("Wallet / app name *"), { target: { value: "JazzCash" } });
  fireEvent.click(screen.getByRole("button", { name: "Bank transfer" }));
  expect(screen.getByLabelText("Bank name *")).toHaveValue("");
  expect(screen.getByLabelText("Received by *")).toHaveValue("Ali");
  expect(PaymentDetailsSchema.safeParse({ ...emptyPaymentDetails, received_by: "Ali", method: "bank" }).success).toBe(false);
});
