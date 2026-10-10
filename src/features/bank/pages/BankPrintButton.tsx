import { useRef, useState } from "react";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import type { BankEntry } from "@/data/repositories/bankRepository";
import { buildBankStatement, statementRows, type StatementOptions } from "./bankStatement";
import "@/features/projects/components/project-print.css";

export function BankPrintButton({entries,disabled}:{entries:BankEntry[];disabled:boolean}) {
 const [open,setOpen]=useState(false),[html,setHtml]=useState(""),[ready,setReady]=useState(false),[error,setError]=useState("");
 const [options,setOptions]=useState<StatementOptions>({accounts:["personal","builder","unassigned"],from:"",to:"",direction:"",method:"",category:"",project:"",summary:true,transactions:true,notes:true,separate:false});
 const frame=useRef<HTMLIFrameElement>(null);
 const update=<K extends keyof StatementOptions>(key:K,value:StatementOptions[K])=>setOptions(o=>({...o,[key]:value}));
 const rows=statementRows(entries,options);
 const invalid=!options.accounts.length || (!options.summary&&!options.transactions) || (!!options.from&&!!options.to&&options.from>options.to) || !rows.length;
 return <><Button variant="secondary" disabled={disabled} onClick={()=>{setOpen(true);setHtml("");setError("");setReady(false);}}><Printer size={17}/>Print statement</Button><Dialog open={open} onOpenChange={setOpen}><DialogContent className={"project-print-dialog "+(html?"has-preview":"")}><DialogHeader><DialogTitle>{html?"Bank statement preview":"What would you like to print?"}</DialogTitle><DialogDescription>Choose accounts and the period to include. These options use all saved transactions, independently of the current table filters and pagination.</DialogDescription></DialogHeader>
 {html ? <iframe title="Bank statement preview" ref={frame} srcDoc={html} onLoad={()=>setReady(true)}/> : <div className="bank-print-options">
 <fieldset><legend>Accounts</legend><div className="bank-print-checks">{[["personal","Personal"],["builder","Builder"],["unassigned","Unassigned"]].map(([key,label])=><label key={key}><input type="checkbox" checked={options.accounts.includes(key)} onChange={e=>update("accounts",e.target.checked?[...options.accounts,key]:options.accounts.filter(k=>k!==key))}/>{label}</label>)}</div></fieldset>
 <div className="bank-print-grid"><label>From date<input type="date" value={options.from} onChange={e=>update("from",e.target.value)}/></label><label>To date<input type="date" value={options.to} onChange={e=>update("to",e.target.value)}/></label>
 <label>Money movement<select value={options.direction} onChange={e=>update("direction",e.target.value)}><option value="">Received & paid</option><option value="in">Money received</option><option value="out">Money paid</option></select></label>
 <label>Payment method<select value={options.method} onChange={e=>update("method",e.target.value)}><option value="">All methods</option>{[...new Set(entries.map(r=>r.method))].sort().map(m=><option key={m}>{m}</option>)}</select></label>
 <label>Transaction category<select value={options.category} onChange={e=>update("category",e.target.value)}><option value="">All categories</option>{[...new Set(entries.map(r=>r.category))].sort().map(c=><option key={c}>{c}</option>)}</select></label>
 <label>Project<select value={options.project} onChange={e=>update("project",e.target.value)}><option value="">All projects & personal payments</option>{[...new Map(entries.filter(r=>r.project_id).map(r=>[r.project_id!,r.project])).entries()].map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></label></div>
 <fieldset><legend>Include in statement</legend><div className="bank-print-checks">{([["summary","Summary totals"],["transactions","Transaction table"],["notes","Descriptions / notes"],["separate","Separate page per account"]] as const).map(([key,label])=><label key={key}><input type="checkbox" checked={options[key]} onChange={e=>update(key,e.target.checked)}/>{label}</label>)}</div></fieldset>
 <p role="status">{rows.length} matching transactions. Leave dates blank for all saved dates.</p>{invalid&&<p className="text-destructive">Choose an account, a valid date range, and at least one report section with matching transactions.</p>}
 </div>}
 {error&&<p role="alert" className="text-destructive">{error}</p>}<div className="project-print-actions">{html&&<Button variant="outline" onClick={()=>{setHtml("");setReady(false);}}>Change options</Button>}<Button variant="outline" onClick={()=>setOpen(false)}>Close</Button>{html?<Button disabled={!ready} onClick={()=>{try{if(!frame.current?.contentWindow)throw Error();frame.current.contentWindow.focus();frame.current.contentWindow.print();}catch{setError("Could not open the print dialog. Please try again.");}}}><Printer size={16}/>Print / Save PDF</Button>:<Button disabled={invalid} onClick={()=>{setReady(false);setHtml(buildBankStatement(entries,options));}}>Preview statement</Button>}</div>
 </DialogContent></Dialog></>;
}
