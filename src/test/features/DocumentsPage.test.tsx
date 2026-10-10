import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { DocumentsPage } from "@/features/documents/pages/DocumentsPage";
import { groupDocuments, documentScope } from "@/features/documents/pages/documentGroups";
import { listDocuments, type DocumentRecord } from "@/data/repositories/documentsRepository";
vi.mock("@/data/repositories/documentsRepository",()=>({listDocuments:vi.fn(),openDocument:vi.fn(),readDocumentImage:vi.fn().mockResolvedValue("blob:preview")}));
URL.revokeObjectURL = vi.fn();
const doc=(id:string,type:string,project="p1"):DocumentRecord=>({id,title:id+".png",doc_type:type,doc_date:null,notes:null,file_path:id,mime:"image/png",size:10,owner_type:"transaction",owner_id:id,project_id:project,project_name:project?"Residency":null,created_at:"2026-10-03"});
it("opens project collections and separates construction, land, partners and sales",async()=>{
 vi.mocked(listDocuments).mockResolvedValue([doc("plot","land_image"),doc("bill","construction_supplier_bill"),doc("partner","partner_contribution_receipt"),doc("sale","project_sale_document")]);
 render(<DocumentsPage/>);
 fireEvent.click(await screen.findByRole("button",{name:/Open Residency documents/}));
 const dialog=screen.getByRole("dialog");
 expect(within(dialog).getByText("plot.png")).toBeInTheDocument();
 fireEvent.click(within(dialog).getByRole("button",{name:/^Construction/}));
 expect(within(dialog).getByText("bill.png")).toBeInTheDocument();
 expect(within(dialog).queryByText("plot.png")).not.toBeInTheDocument();
 fireEvent.click(within(dialog).getByRole("button",{name:/^Partners/}));
 expect(within(dialog).getByText("partner.png")).toBeInTheDocument();
 fireEvent.click(within(dialog).getByRole("button",{name:/^Sales/}));
 expect(within(dialog).getByText("sale.png")).toBeInTheDocument();
});
it("keeps same-name projects separate and personal files out of project collections",()=>{
 const rows=[doc("a","land_image","p1"),doc("b","land_image","p2"),doc("c","amanat_deposit_receipt","")];
 const groups=groupDocuments(rows);expect(groups).toHaveLength(3);
 expect(groups.filter(g=>g.scope==="Projects").every(g=>g.documents.length===1)).toBe(true);
 expect(documentScope({...doc("d","receipt",""),owner_type:"udhaar_payment"})).toBe("Udhaar");
 expect(documentScope({...doc("e","receipt",""),owner_type:"personal_expense"})).toBe("Personal Expense");
});
it("starts at All and filters personal deposits using the main navigation",async()=>{
 vi.mocked(listDocuments).mockResolvedValue([doc("plot","land_image"),doc("deposit","amanat_deposit_receipt","")]);
 render(<DocumentsPage/>);
 await screen.findByRole("button",{name:/Open Residency documents/});
 expect(screen.getByRole("button",{name:/^All/})).toHaveAttribute("aria-pressed","true");
 fireEvent.click(screen.getByRole("button",{name:/^Personal Deposit/}));
 expect(screen.queryByRole("button",{name:/Open Residency documents/})).not.toBeInTheDocument();
 fireEvent.click(screen.getByRole("button",{name:/Open Personal Deposit documents/}));
 expect(within(screen.getByRole("dialog")).getByText("deposit.png")).toBeInTheDocument();
});
it("finds projects by filenames and preserves unlinked documents",async()=>{
 vi.mocked(listDocuments).mockResolvedValue([doc("plot","land_image"),doc("misc","unknown","")]);
 render(<DocumentsPage/>);
 await screen.findByRole("button",{name:/Other documents/});
 fireEvent.change(screen.getByLabelText("Search document collections"),{target:{value:"plot.png"}});
 expect(screen.getByRole("button",{name:/Open Residency documents/})).toBeInTheDocument();
 expect(screen.queryByRole("button",{name:/Other documents/})).not.toBeInTheDocument();
});

it("shows image previews with source names and opens the full image",async()=>{
 vi.mocked(listDocuments).mockResolvedValue([{...doc("agreement","project_sale_document"),source_name:"Ahmed · flat A-2"}]);
 render(<DocumentsPage/>);
 fireEvent.click(await screen.findByRole("button",{name:"Open Residency documents"}));
 expect(await screen.findByAltText("agreement.png")).toHaveAttribute("src","blob:preview");
 expect(screen.getByText("Ahmed · flat A-2")).toBeInTheDocument();
 fireEvent.click(screen.getByRole("button",{name:"Open agreement.png"}));
 expect(screen.getByRole("dialog",{name:"agreement.png"})).toBeInTheDocument();
});
