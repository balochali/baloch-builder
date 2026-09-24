import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ProjectDashboard } from "@/features/projects/components/ProjectDashboard";
import type { Project, ProjectBuildingDetails, ProjectEstimate, Transaction } from "@/domain/types";
import type { ProjectPartnerRow } from "@/data/repositories/projectPartnersRepository";

describe("ProjectDashboard", () => {
  it("shows saved building, partner and financial records as charts", () => {
    render(<ProjectDashboard
      project={{ name: "Baloch Residency", status: "planning" } as Project}
      buildingDetails={{ planned_flats: 12, planned_shops: 3, planned_offices: 0, planned_houses: 0 } as ProjectBuildingDetails}
      partners={[{ name: "Ali", share_bp: 4000 } as ProjectPartnerRow]}
      contributions={[{ amount: 300_000 } as Transaction]}
      estimates={[{ kind: "cost", minimum_amount: 500_000, maximum_amount: 700_000 } as ProjectEstimate,
        { kind: "revenue", minimum_amount: 900_000, maximum_amount: 1_100_000 } as ProjectEstimate]}
      actualCosts={[{ date: "2026-09-24", amount: 200_000 } as Transaction]}
    />);
    expect(screen.getByRole("img", { name: "12 flats, 3 shops" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /Ali 40.00 percent/ })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Highest expected recovery: Rs 1,100,000" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /Spending rose to Rs 200,000/ })).toBeInTheDocument();
  });
});
