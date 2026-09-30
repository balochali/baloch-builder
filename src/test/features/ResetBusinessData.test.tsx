import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { ResetBusinessData } from "@/features/settings/components/ResetBusinessData";
import { resetBusinessData } from "@/data/repositories/resetRepository";
vi.mock("@/data/repositories/resetRepository", () => ({ resetBusinessData: vi.fn() }));
it("requires exact confirmation before resetting and allows cancellation", async () => {
  vi.mocked(resetBusinessData).mockResolvedValue();
  render(<ResetBusinessData />);
  fireEvent.click(screen.getByRole("button", { name: "Reset all business data" }));
  expect(screen.getByRole("button", { name: "Permanently reset all business data" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(resetBusinessData).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Reset all business data" }));
  fireEvent.change(screen.getByLabelText("Type RESET ALL DATA to confirm"), { target: { value: "RESET ALL DATA" } });
  fireEvent.click(screen.getByRole("button", { name: "Permanently reset all business data" }));
  await screen.findByRole("status");
  expect(resetBusinessData).toHaveBeenCalledTimes(1);
});
