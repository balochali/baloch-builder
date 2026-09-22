import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BuildingDetailsDialog } from "@/features/projects/components/BuildingDetailsDialog";

describe("BuildingDetailsDialog", () => {
  it("reveals relevant steps and saves the floor-by-floor flat plan", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<BuildingDetailsDialog projectId="11111111-1111-4111-8111-111111111111"
      details={null} onOpenChange={vi.fn()} onSubmit={onSubmit} />);

    expect(screen.getByLabelText("Building use")).toBeInTheDocument();
    expect(screen.queryByLabelText("Planned shops")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Choose the building use");

    fireEvent.change(screen.getByLabelText("Building use"), { target: { value: "mixed-use" } });
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Flats/i }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Shops/i }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Masjid/i }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    fireEvent.change(screen.getByLabelText("Total floors, including ground *"), { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText("Basements"), { target: { value: "1" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Add flat type" })[1]);
    fireEvent.change(screen.getByLabelText("Rooms per flat"), { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText("Number of flats"), { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    expect(screen.getByLabelText("Planned shops")).toBeInTheDocument();
    expect(screen.queryByLabelText("Planned offices")).not.toBeInTheDocument();
    expect(screen.getByText("Masjid included in the plan")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Planned shops"), { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText("Plot area"), { target: { value: "10" } });
    fireEvent.change(screen.getByLabelText("Plot area unit"), { target: { value: "marla" } });
    fireEvent.change(screen.getByLabelText("Total planned covered area (sq ft)"), { target: { value: "18000" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Details" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      building_use: "mixed-use", floors_above_ground: 2, basement_count: 1,
      spaces: ["flats", "shops", "masjid"], planned_shops: 2,
      floor_layout: [
        { floor_index: 0, flat_types: [] },
        { floor_index: 1, flat_types: [{ rooms: 2, count: 3 }] },
      ],
      covered_area_sqft: 18_000,
    })));
  });

  it("skips flat layouts for a commercial shop project", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<BuildingDetailsDialog projectId="11111111-1111-4111-8111-111111111111"
      details={null} onOpenChange={vi.fn()} onSubmit={onSubmit} />);
    fireEvent.change(screen.getByLabelText("Building use"), { target: { value: "commercial" } });
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Masjid/i }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByRole("alert")).toHaveTextContent("flat, shop, office or house");
    fireEvent.click(screen.getByRole("checkbox", { name: /Shops/i }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.change(screen.getByLabelText("Total floors, including ground *"), { target: { value: "1" } });
    expect(screen.queryByText("Flats on each floor")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.change(screen.getByLabelText("Planned shops"), { target: { value: "4" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Details" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      spaces: ["masjid", "shops"], floor_layout: [], planned_shops: 4,
    })));
  });
});
