import { listSaleEvents, addSaleRefund } from "@/data/repositories/saleEventsRepository";
vi.mock("@/data/repositories/saleEventsRepository", () => ({listSaleEvents:vi.fn().mockResolvedValue([]),addSaleRefund:vi.fn()}));
import { listSalePayments, addSalePayment } from "@/data/repositories/salePaymentsRepository";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { ProjectSalesPanel } from "@/features/projects/components/ProjectSalesPanel";
import { addProjectSale, listProjectSales } from "@/data/repositories/projectSalesRepository";
import { listProjectSaleDocuments } from "@/data/repositories/documentsRepository";

vi.mock("@/data/repositories/projectSalesRepository", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/data/repositories/projectSalesRepository")>()),
  addProjectSale: vi.fn(), listProjectSales: vi.fn(),
}));
vi.mock("@/data/repositories/documentsRepository", () => ({
  listProjectSaleDocuments: vi.fn(), saveProjectSaleImage: vi.fn(), readDocumentImage: vi.fn(),
}));

vi.mock("@/data/repositories/salePaymentsRepository", async original => ({...await original<typeof import("@/data/repositories/salePaymentsRepository")>(),listSalePayments:vi.fn(),addSalePayment:vi.fn()}));

const projectId = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  vi.mocked(listSaleEvents).mockResolvedValue([]);
  vi.mocked(listSalePayments).mockResolvedValue([]);
  vi.mocked(listProjectSales).mockResolvedValue([]);
  vi.mocked(listProjectSaleDocuments).mockResolvedValue([]);
  vi.mocked(addProjectSale).mockReset();
});

it("records a shop sale with its buyer, floor and agreed price", async () => {
  vi.mocked(addProjectSale).mockImplementation(async (input) => ({ id: "sale-1", ...input, created_at: "2026-10-04", updated_at: "2026-10-04", archived: 0, custom: JSON.stringify({initial_payment:{id:"first"}}) }));
  render(<ProjectSalesPanel projectId={projectId} buildingDetails={null} />);
  expect(await screen.findByRole("heading", { name: "No units sold yet" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Record sale" }));
  fireEvent.click(screen.getByRole("button", { name: /ShopNo planned/ }));
  fireEvent.change(screen.getByLabelText(/Shop number/), { target: { value: "S-04" } });
  fireEvent.change(screen.getByLabelText(/Floor \*/), { target: { value: "1" } });
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  fireEvent.change(screen.getByLabelText(/Buyer name/), { target: { value: "Muhammad Ali" } });
  fireEvent.change(screen.getByLabelText(/Agreed price/), { target: { value: "8500000" } });
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  expect(screen.queryByText("Add sale documents")).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Payment amount (Rs) *"),{target:{value:"500000"}});
  fireEvent.click(screen.getByRole("radio",{name:"Builder Account"}));
  fireEvent.click(screen.getByRole("button", { name: "Save sale" }));
  await waitFor(() => expect(addProjectSale).toHaveBeenCalledWith(expect.objectContaining({
    project_id: projectId, kind: "shop", floor_index: 1, unit_number: "S-04",
    buyer_name: "Muhammad Ali", price: 8_500_000,
  }), expect.objectContaining({amount:500000,account_key:"builder",method:"cash"})));
  expect(await screen.findByRole("heading", { name: "Shop S-04" })).toBeInTheDocument();
  expect(screen.getByText("Still to receive")).toHaveTextContent("8,000,000");
  vi.mocked(addSalePayment).mockImplementation(async (_project,saleId,input)=>({...input,id:"next",sale_id:saleId} as never));
  fireEvent.click(screen.getByRole("button",{name:"Record payment"}));
  fireEvent.change(screen.getByLabelText("Payment amount (Rs) *"),{target:{value:"100000"}});
  fireEvent.click(screen.getByRole("radio",{name:"Builder Account"}));
  fireEvent.click(screen.getByRole("button",{name:"Save payment"}));
  await waitFor(()=>expect(addSalePayment).toHaveBeenCalledWith(projectId,"sale-1",expect.objectContaining({amount:100000,method:"cash"})));
  await waitFor(()=>expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(screen.getByText("Still to receive")).toHaveTextContent("7,900,000");
});

it("shows phased refund progress and refreshes it after another payment",async()=>{
 const event={id:"cancel",sale_id:"sale",project_id:projectId,kind:"cancel" as const,date:"2026-10-01",buyer_name:"Ali",received:200000,rate_bp:1000,fee:20000,refund:180000,refunded:50000,resale_price:0,details:JSON.stringify({unit_kind:"flat",unit_number:"A1"}),refund_payments:JSON.stringify([{id:"first",date:"2026-10-01",amount:50000,method:"cash",reference:""}])};
 vi.mocked(listSaleEvents).mockResolvedValue([event]);
 render(<ProjectSalesPanel projectId={projectId} buildingDetails={null}/>);
 expect(await screen.findByRole("progressbar",{name:"Refund progress for Ali"})).toHaveAttribute("aria-valuenow","28");
 expect(screen.getByText("Remaining refund")).toHaveTextContent("130,000");
 fireEvent.click(screen.getByRole("button",{name:"Record refund"}));
 fireEvent.change(screen.getByLabelText("Payment amount (Rs) *"),{target:{value:"130000"}});
 fireEvent.click(screen.getByRole("radio",{name:"Builder Account"}));
 vi.mocked(addSaleRefund).mockResolvedValue(undefined);
 vi.mocked(listSaleEvents).mockResolvedValue([{...event,refunded:180000}]);
 fireEvent.click(screen.getByRole("button",{name:"Save refund"}));
 await waitFor(()=>expect(screen.getByRole("button",{name:"Nothing left to refund"})).toBeDisabled());
 expect(screen.getByRole("progressbar",{name:"Refund progress for Ali"})).toHaveAttribute("aria-valuenow","100");
});
