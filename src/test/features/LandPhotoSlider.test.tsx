import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { LandPhotoSlider } from "@/features/land/pages/LandPhotoSlider";
import { listLandDocuments, readDocumentImage, type DocumentRecord } from "@/data/repositories/documentsRepository";
vi.mock("@/data/repositories/documentsRepository",()=>({listLandDocuments:vi.fn(),readDocumentImage:vi.fn()}));
const photo=(id:string)=>({id,title:id+".png",doc_type:"land_image",mime:"image/png",file_path:id} as DocumentRecord);
beforeEach(()=>{vi.mocked(readDocumentImage).mockImplementation(async p=>`blob:${p.id}`);URL.revokeObjectURL=vi.fn();});
it("shows a single property image without slider controls",async()=>{
 vi.mocked(listLandDocuments).mockResolvedValue([photo("one"),{...photo("receipt"),doc_type:"land_payment_receipt"}]);
 render(<LandPhotoSlider landId="land" title="Corner plot"/>);
 expect(await screen.findByAltText("Corner plot — one.png")).toHaveAttribute("src","blob:one");
 expect(screen.queryByRole("button",{name:/Next photo/})).not.toBeInTheDocument();
});
it("shows one image at a time, wraps navigation and releases old images",async()=>{
 vi.mocked(listLandDocuments).mockResolvedValue([photo("one"),photo("two")]);
 const {unmount}=render(<LandPhotoSlider landId="land" title="Corner plot"/>);
 await screen.findByAltText("Corner plot — one.png");
 fireEvent.click(screen.getByRole("button",{name:/Next photo/}));
 expect(await screen.findByAltText("Corner plot — two.png")).toHaveAttribute("src","blob:two");
 expect(screen.queryByAltText("Corner plot — one.png")).not.toBeInTheDocument();
 expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:one");
 fireEvent.click(screen.getByRole("button",{name:/Next photo/}));
 await screen.findByAltText("Corner plot — one.png");
 unmount();expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:two");
});
it("shows an honest empty state and retries failed loading",async()=>{
 vi.mocked(listLandDocuments).mockRejectedValueOnce(new Error("offline")).mockResolvedValue([]);
 render(<LandPhotoSlider landId="land" title="Corner plot"/>);
 fireEvent.click(await screen.findByRole("button",{name:"Retry photos"}));
 await waitFor(()=>expect(screen.getByRole("status")).toHaveTextContent("No property photos added"));
});
