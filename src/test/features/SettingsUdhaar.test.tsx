import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { SettingsPage } from "@/features/settings/pages/SettingsPage";
import { clearAllUdhaarData } from "@/data/repositories/udhaarRepository";
vi.mock("@/data/repositories/udhaarRepository", () => ({ clearAllUdhaarData: vi.fn() }));
beforeEach(() => { vi.mocked(clearAllUdhaarData).mockReset(); });

it("requires typed confirmation and clears only after the final click", async () => {
  vi.mocked(clearAllUdhaarData).mockResolvedValue();
  render(<SettingsPage />);
  fireEvent.click(screen.getByRole("button", { name: "Delete all Udhaar data" }));
  const confirm = screen.getByRole("button", { name: "Permanently delete Udhaar data" });
  expect(confirm).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Type DELETE to confirm"), {
    target: { value: "DELETE" },
  });
  expect(clearAllUdhaarData).not.toHaveBeenCalled();
  fireEvent.click(confirm);
  await screen.findByRole("status");
  expect(clearAllUdhaarData).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

it("allows cancellation and reports deletion failures", async () => {
  vi.mocked(clearAllUdhaarData).mockRejectedValue(new Error("database failure"));
  render(<SettingsPage />);
  fireEvent.click(screen.getByRole("button", { name: "Delete all Udhaar data" }));
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(clearAllUdhaarData).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Delete all Udhaar data" }));
  fireEvent.change(screen.getByLabelText("Type DELETE to confirm"), {
    target: { value: "DELETE" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Permanently delete Udhaar data" }));
  await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Could not delete"));
  expect(screen.getByRole("dialog")).toBeInTheDocument();
});
