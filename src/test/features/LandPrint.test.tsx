import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { LandPrintDialog } from "@/features/land/pages/LandPrintDialog";
import type { ProjectLand } from "@/data/repositories/projectStageRepository";
vi.mock("@/data/repositories/documentsRepository",()=>({listLandDocuments:vi.fn().mockResolvedValue([{id:"pdf",title:"Deed.pdf",mime:"application/pdf",file_path:"deed.pdf",doc_type:"land_image"}]),readDocumentImage:vi.fn(),openDocument:vi.fn()}));
it("selects content and labels the print preview with project and property",async()=>{
 const land={id:"land1",title:"Corner plot",projectName:"Residency",location:"Karachi",purchase_date:"2026-10-01",area_value:500,area_unit:"sqyd",price:100000,seller_name:"Ali",notes:"",account_key:"personal",payment_details:null} as unknown as ProjectLand & {projectName:string};
 render(<LandPrintDialog land={land} onClose={()=>{}}/>);
 await screen.findByRole("button",{name:"Open PDF to print"});
 fireEvent.click(screen.getByRole("checkbox",{name:"Land details & purchase summary"}));
 expect(screen.getByRole("button",{name:"Preview report"})).toBeDisabled();
 fireEvent.click(screen.getByRole("checkbox",{name:"Payment details"}));
 fireEvent.click(screen.getByRole("button",{name:"Preview report"}));
 const frame=await screen.findByTitle("Land print preview");
 const html=frame.getAttribute("srcdoc") || "";
 expect(html).toContain("Residency");expect(html).toContain("Corner plot");expect(html).toContain("Payment details");expect(html).not.toContain("Purchase price");
});
