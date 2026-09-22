import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ProjectDialog } from "@/features/projects/components/ProjectDialog";

describe("ProjectDialog", () => {
  it("requires a project name and address", async () => {
    const onSubmit = vi.fn();
    render(<ProjectDialog open onOpenChange={vi.fn()} onSubmit={onSubmit} />);
    fireEvent.click(screen.getByRole("button", { name: "Create Project" }));
    expect(await screen.findByText("Project name is required")).toBeInTheDocument();
    expect(screen.getByText("Project address is required")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("submits project details and closes after a successful save", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const onOpenChange = vi.fn();
    render(<ProjectDialog open onOpenChange={onOpenChange} onSubmit={onSubmit} />);
    fireEvent.change(screen.getByLabelText(/Project name/i), { target: { value: "Baloch Residency" } });
    fireEvent.change(screen.getByLabelText(/Project address/i), { target: { value: "Quetta" } });
    fireEvent.click(screen.getByRole("button", { name: "Create Project" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      name: "Baloch Residency", location: "Quetta", status: "planning",
    })));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });
});
