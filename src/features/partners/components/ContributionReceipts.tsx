import { useEffect, useState } from "react";
import { listTransactionReceipts, type DocumentRecord } from "@/data/repositories/documentsRepository";
import { DocumentPreviewCards } from "@/features/documents/components/DocumentPreviewCards";
import "@/features/documents/pages/documents-page.css";

export function ContributionReceipts({transactionId}: {transactionId: string}) {
 const [documents,setDocuments]=useState<DocumentRecord[]>([]);
 const [error,setError]=useState(false);
 useEffect(()=>{
  let active=true;
  const refresh=()=>{void listTransactionReceipts(transactionId).then(rows=>{if(active){setDocuments(rows);setError(false);}}).catch(()=>{if(active)setError(true);});};
  refresh(); window.addEventListener("partner-receipts-updated",refresh);
  return()=>{active=false;window.removeEventListener("partner-receipts-updated",refresh);};
 },[transactionId]);
 if(error)return <p role="alert" className="text-sm text-destructive">Could not load payment receipts.</p>;
 if(!documents.length)return null;
 return <div className="contribution-receipts"><h4>Payment receipts · {documents.length}</h4><DocumentPreviewCards documents={documents}/></div>;
}
