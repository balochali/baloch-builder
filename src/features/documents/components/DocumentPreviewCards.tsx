import { useEffect, useState } from "react";
import { Eye, FileText, ImageOff, Building2, HardHat, Users, Store, Landmark, FolderOpen } from "lucide-react";
import { usePagination } from "@/components/Pagination";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { readDocumentImage, openDocument, type DocumentRecord } from "@/data/repositories/documentsRepository";
import { projectFileTab } from "../pages/documentGroups";
const icons = {All:FolderOpen,Land:Landmark,Construction:HardHat,Partners:Users,Sales:Store,Other:Building2};
export function DocumentPreviewCards({documents}: {documents:DocumentRecord[]}) {
 const pages=usePagination(documents,JSON.stringify(documents.map(d=>d.id)),"documents");
 return <>{pages.controls}<div className="document-preview-grid">{pages.items.map(doc=><DocumentPreviewCard key={doc.id} document={doc}/>)}</div></>;
}
function DocumentPreviewCard({document:doc}:{document:DocumentRecord}){
 const [url,setUrl]=useState(""),[error,setError]=useState(""),[preview,setPreview]=useState(false);
 const isImage=!!doc.mime?.startsWith("image/");
 const section=projectFileTab(doc),Icon=icons[section];
 useEffect(()=>{if(!isImage)return;let active=true;let objectUrl="";readDocumentImage(doc).then(value=>{objectUrl=value;if(active)setUrl(value);else URL.revokeObjectURL(value);}).catch(()=>{if(active)setError("Image preview unavailable");});return()=>{active=false;if(objectUrl)URL.revokeObjectURL(objectUrl);};},[doc,isImage]);
 async function open(){if(isImage){setPreview(true);return;}if(!doc.file_path)return;try{await openDocument(doc.file_path);}catch{setError("Could not open this document.");}}
 const kind=doc.doc_type?.replace(/_/g," ") || "Document";
 return <article className="document-preview-card"><button type="button" className="document-preview-image" aria-label={`Open ${doc.title}`} onClick={()=>void open()} disabled={!doc.file_path}>
 {isImage ? url ? <img src={url} alt={doc.title} loading="lazy" onError={()=>{setUrl("");setError("Image preview unavailable");}}/> : <span className="document-preview-placeholder"><ImageOff size={28}/>{error || "Loading preview…"}</span> : <span className="document-preview-placeholder"><FileText size={36}/>{doc.mime === "application/pdf" ? "PDF document" : "Document"}</span>}
 <span className="document-preview-eye"><Eye size={18}/></span><span className="document-preview-open">{isImage ? "Click to preview" : "Open document"}</span>
 </button><div className="document-preview-info"><span className="document-preview-source"><Icon size={15}/>{section === "Other" ? (doc.doc_type?.startsWith("amanat_") ? "Personal Deposit" : "Other") : section}</span><h3 title={doc.title}>{doc.title}</h3><p>{kind}</p>{doc.source_name && <strong>{doc.source_name}</strong>}{doc.project_name && <small>{doc.project_name}</small>}{error && !isImage && <p role="alert">{error}</p>}</div>
 <Dialog open={preview} onOpenChange={setPreview}><DialogContent className="document-image-preview" aria-describedby={undefined}><DialogHeader><DialogTitle>{doc.title}</DialogTitle></DialogHeader>{url ? <img src={url} alt={doc.title}/> : <p role="status">{error || "Loading image…"}</p>}</DialogContent></Dialog></article>;
}
