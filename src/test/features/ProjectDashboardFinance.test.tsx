import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { ProjectDashboard } from "@/features/projects/components/ProjectDashboard";
import type { Project, Transaction, ProjectEstimate } from "@/domain/types";
import type { ProjectSale } from "@/data/repositories/projectSalesRepository";
vi.mock("@/features/projects/components/ProjectInsights", () => ({ BuildingAreaChart: () => null, BuildingMixChart: () => null, OwnershipChart: () => null, SpendingChart: () => null }));
it("includes contractor payments once and distinguishes sales, estimates and result", () => {
  render(<ProjectDashboard project={{name:"Project",status:"construction"} as Project} buildingDetails={null} partners={[]} contributions={[]}
    actualCosts={[{type:"construction_cost",amount:200000,custom:'{"contractor_id":"c"}'},{type:"construction_cost",amount:100000,custom:'{}'},{type:"land_purchase",amount:100000,custom:'{}'}] as Transaction[]}
    sales={[{kind:"flat",price:900000},{kind:"shop",price:100000}] as ProjectSale[]}
    estimates={[{kind:"cost",minimum_amount:400000,maximum_amount:500000},{kind:"revenue",minimum_amount:1000000,maximum_amount:1200000}] as ProjectEstimate[]} />);
  const metric = (label: string) => screen.getByText(label).parentElement!;
  expect(metric("Construction paid")).toHaveTextContent("Rs 3 lakh");
  expect(metric("Of this, paid to thekedar")).toHaveTextContent("Rs 2 lakh");
  expect(metric("Flat sales agreed")).toHaveTextContent("Rs 9 lakh");
  expect(metric("Shop sales agreed")).toHaveTextContent("Rs 1 lakh");
  expect(screen.getByText("sales above spending").parentElement).toHaveTextContent("Rs 6 lakh");
  expect(screen.getByRole("heading", {name:"Money spent so far"})).toBeInTheDocument();
  expect(screen.getByRole("heading", {name:"Sales made so far"})).toBeInTheDocument();
  expect(metric("Expected profit / loss")).toHaveTextContent("Rs 5 lakh");
  expect(metric("Expected profit / loss")).toHaveTextContent("Rs 8 lakh");
});
