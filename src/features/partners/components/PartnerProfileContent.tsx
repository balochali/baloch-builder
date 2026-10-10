import { ContributionReceipts } from "@/features/partners/components/ContributionReceipts";
import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, UserRound, LayoutDashboard, HandCoins, History, Paperclip } from "lucide-react";
import { PaginatedRecords } from "@/components/Pagination";
import { PartnerDocuments } from "@/features/projects/components/PartnerDocuments";
import { ProjectPartnerDialog } from "@/features/projects/components/ProjectPartnerDialog";
import { PaymentDetailsView } from "@/features/partners/components/PaymentDetailsView";
import { type PartnerOverviewRow, type PartnerContributionInput } from "@/data/repositories/projectPartnersRepository";
import type { Transaction } from "@/domain/types";
import { formatPKR, formatPKRInLakhCrore } from "@/domain/money";
import { formatDate } from "@/lib/dates";
export function PartnerProfileContent({partner, payments, onContribution}: {partner:PartnerOverviewRow; payments:Transaction[]; onContribution:(value:PartnerContributionInput)=>Promise<string>}) {
const [tab,setTab]=useState("overview");
const remaining=partner.agreed_contribution === null ? null : Math.max(0,partner.agreed_contribution-partner.contributed);
const progress=partner.agreed_contribution ? Math.min(100,partner.contributed/partner.agreed_contribution*100) : partner.agreed_contribution === 0 ? 100 : 0;
const status=remaining === null ? "no-target" : remaining === 0 ? "settled" : partner.contributed > 0 ? "partial" : "unpaid";
return <>
<div className="partner-modal-project">{partner.project_name} · {(partner.share_bp/100).toFixed(2)}% ownership</div>
<div className="partner-modal-tabs" role="tablist" aria-label="Partner details sections">{[{id:"overview",label:"Overview",icon:LayoutDashboard},{id:"contribution",label:"Record contribution",icon:HandCoins},{id:"history",label:"Payment history",icon:History},{id:"documents",label:"Documents",icon:Paperclip}].map(({id,label,icon:Icon})=><button key={id} type="button" role="tab" id={"partner-detail-tab-"+id} aria-controls={"partner-detail-panel-"+id} aria-selected={tab===id} onClick={()=>setTab(id)}><Icon size={17}/>{label}</button>)}</div>
<section role="tabpanel" id="partner-detail-panel-overview" aria-labelledby="partner-detail-tab-overview" hidden={tab!=="overview"}>                      <section className={`partners-card is-${status}`}>
                        <div className="partners-card-top">
                          <span className="partners-avatar">
                            <UserRound size={25} />
                          </span>
                          <div className="partners-person">
                            <h2 className="text-lg font-semibold">{partner.name}</h2>
                            <p className="text-sm text-muted-foreground">
                              {partner.phone || "No mobile number"}
                              {partner.phone2 ? ` · ${partner.phone2}` : ""}
                            </p>
                          </div>
                          <span className="partners-share">
                            {(partner.share_bp / 100).toFixed(2)}% share
                          </span>
                        </div>
                        <div className="partners-card-status">
                          {status === "settled"
                            ? "Contribution received"
                            : status === "partial"
                              ? "Partly received"
                              : status === "no-target"
                                ? "No amount agreed"
                                : "Awaiting payment"}
                        </div>
                        <div className="partners-card-balance">
                          <small>
                            {remaining === null ? "Received so far" : "Still to receive"}
                          </small>
                          <strong>{formatPKRInLakhCrore(remaining ?? partner.contributed)}</strong>
                        </div>
                        {remaining !== null && (
                          <>
                            <div className="partners-progress-caption">
                              <span>Contribution progress</span>
                              <strong>{Math.round(progress)}% received</strong>
                            </div>
                            <div
                              className="partners-progress"
                              role="img"
                              aria-label={`${partner.name}: ${formatPKR(partner.contributed)} received, ${formatPKR(remaining)} remaining`}
                            >
                              <span style={{ width: `${progress}%` }} />
                            </div>
                          </>
                        )}
                        <div className="partners-card-split">
                          <span>
                            Agreed{" "}
                            <strong>
                              {partner.agreed_contribution === null
                                ? "Not set"
                                : formatPKR(partner.agreed_contribution)}
                            </strong>
                          </span>
                          <span>
                            Received <strong>{formatPKR(partner.contributed)}</strong>
                          </span>
                        </div>
                        <div className="partners-card-project">
                          <p className="text-xs text-muted-foreground">Project</p>
                          <Link
                            to={`/projects/${partner.project_id}`}
                            className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
                          >
                            {partner.project_name}
                            {partner.project_code ? ` · ${partner.project_code}` : ""}
                            <ArrowUpRight className="size-4" />
                          </Link>
                          <p className="text-xs text-muted-foreground">
                            {partner.project_location || "No project address"}
                            {partner.project_status ? ` · ${partner.project_status}` : ""}
                          </p>
                        </div>
                        <div className="partners-card-facts">
                          <Fact label="Address" value={partner.address} />
                          <Fact
                            label="Partner status"
                            value={partner.partner_status || partner.partnership_status}
                          />
                          <Fact label="Partner since" value={formatDate(partner.created_at)} />
                        </div>
                        {partner.notes && (
                          <div className="mt-3 text-sm">
                            <Fact label="Notes" value={partner.notes} />
                          </div>
                        )}
</section></section>
<section role="tabpanel" id="partner-detail-panel-contribution" aria-labelledby="partner-detail-tab-contribution" hidden={tab!=="contribution"}><ProjectPartnerDialog embedded projectId={partner.project_id} partner={partner} onContribution={onContribution} onOpenChange={()=>setTab("history")}/></section>
<section role="tabpanel" id="partner-detail-panel-history" aria-labelledby="partner-detail-tab-history" hidden={tab!=="history"}><h3 className="partner-panel-heading">Contribution history · {payments.length}</h3>                        <PaginatedRecords items={payments} label="partner contributions">{payment => <article className="partners-payment" key={payment.id}><div className="flex justify-between gap-3"><strong>{formatDate(payment.date)} · {payment.method || "Other"}</strong><strong>{formatPKR(payment.amount)}</strong></div><p>{payment.description || "Contribution"}{payment.reference ? ` · Ref: ${payment.reference}` : ""}</p><PaymentDetailsView transaction={payment}/><ContributionReceipts transactionId={payment.id}/></article>}</PaginatedRecords>
                        {payments.length === 0 && (
                          <p className="mt-3 text-sm text-muted-foreground">
                            No contributions recorded yet.
                          </p>
                        )}
</section>
{tab==="documents" && <section role="tabpanel" id="partner-detail-panel-documents" aria-labelledby="partner-detail-tab-documents"><PartnerDocuments expanded projectId={partner.project_id} partner={partner}/></section>}
</>;
}
function Fact({label,value}:{label:string;value:string|null|undefined}) {return <div><p className="text-sm text-muted-foreground">{label}</p><p>{value || "—"}</p></div>;}
