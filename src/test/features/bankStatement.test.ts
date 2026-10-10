import { describe,it,expect } from "vitest";
import { buildBankStatement,statementRows,type StatementOptions } from "@/features/bank/pages/bankStatement";
import type { BankEntry } from "@/data/repositories/bankRepository";
const options:StatementOptions={accounts:["personal","builder"],from:"2026-10-01",to:"2026-10-09",direction:"",method:"",category:"",project:"",summary:true,transactions:true,notes:true,separate:false};
const base={source:"transactions",source_id:"1",category:"Contribution",person:"Ali <script>",description:"Notes & details",method:"cash",project:"Residency",project_id:"p"};
const entries:BankEntry[]=[{...base,id:"b",date:"2026-10-09",account_key:"builder",amount:400,direction:"out"},{...base,id:"a",date:"2026-10-01",account_key:"personal",amount:1000,direction:"in"},{...base,id:"old",date:"2026-09-30",account_key:"personal",amount:9999,direction:"in"},{...base,id:"none",date:"2026-10-02",account_key:null,amount:555,direction:"out"}];
describe("bank statements",()=>{
 it("filters accounts and inclusive dates and sorts chronologically",()=>{expect(statementRows(entries,options).map(r=>r.id)).toEqual(["a","b"]);expect(statementRows(entries,{...options,accounts:["builder"],direction:"in"})).toHaveLength(0);});
 it("prints correct movement totals without claiming an actual balance, and escapes saved text",()=>{const html=buildBankStatement(entries,options);expect(html).toContain("Net movement");expect(html).toContain("Rs 600");expect(html).not.toContain("9,999");expect(html).toContain("Ali &lt;script&gt;");expect(html).not.toContain("Ali <script>");expect(html).toContain("not an actual bank balance");});
 it("separates account sections and honours summary-only output",()=>{const html=buildBankStatement(entries,{...options,separate:true,transactions:false});expect(html).toContain("<h2>Personal Account</h2>");expect(html).toContain("<h2>Builder Account</h2>");expect(html).not.toContain("<table>");expect(html).toContain("Net movement");});
 it("supports category, project, method and unassigned filters",()=>{expect(statementRows(entries,{...options,accounts:["unassigned"],method:"cash",project:"p",category:"Contribution"}).map(r=>r.id)).toEqual(["none"]);expect(statementRows(entries,{...options,method:"bank"})).toHaveLength(0);});
});
