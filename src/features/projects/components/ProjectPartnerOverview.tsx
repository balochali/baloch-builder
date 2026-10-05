import { HandCoins, PieChart, Users, Wallet } from "lucide-react";
import type { ProjectPartnerRow } from "@/data/repositories/projectPartnersRepository";
import { formatPKR } from "@/domain/money";

const colors = ["#6d35e8", "#0d967d", "#e89615", "#367cf3", "#de4f78", "#0896b8"];

export function ProjectPartnerOverview({ partners }: { partners: ProjectPartnerRow[] }) {
  const assignedBp = partners.reduce((sum, partner) => sum + partner.share_bp, 0);
  const received = partners.reduce((sum, partner) => sum + partner.contributed, 0);
  const agreed = partners.reduce((sum, partner) => sum + (partner.agreed_contribution ?? 0), 0);
  const remaining = partners.reduce(
    (sum, partner) => sum + Math.max(0, (partner.agreed_contribution ?? 0) - partner.contributed),
    0,
  );
  const committed = partners.filter((partner) => partner.agreed_contribution !== null);
  const committedReceived = committed.reduce((sum, partner) => sum + partner.contributed, 0);
  const metrics = [
    {
      label: "Partners",
      value: String(partners.length),
      note: "Linked to this project",
      icon: Users,
      color: "purple",
    },
    {
      label: "Share assigned",
      value: `${(assignedBp / 100).toFixed(2)}%`,
      note: `${((10_000 - assignedBp) / 100).toFixed(2)}% still available`,
      icon: PieChart,
      color: "blue",
    },
    {
      label: "Money received",
      value: formatPKR(received),
      note: "Payments recorded so far",
      icon: HandCoins,
      color: "green",
    },
    {
      label: "Still to receive",
      value: committed.length ? formatPKR(remaining) : "No target",
      note: committed.length ? "Against agreed contributions" : "Add an agreed amount to track",
      icon: Wallet,
      color: "orange",
    },
  ];
  return (
    <div className="project-partner-overview">
      <div className="project-partner-metrics">
        {metrics.map(({ label, value, note, icon: Icon, color }) => (
          <div className={`project-partner-metric is-${color}`} key={label}>
            <span>
              <Icon size={22} aria-hidden="true" />
            </span>
            <small>{label}</small>
            <strong>{value}</strong>
            <p>{note}</p>
          </div>
        ))}
      </div>
      {partners.length > 0 && (
        <div className="project-partner-visuals">
          <section className="project-partner-visual" aria-labelledby="project-ownership-title">
            <div className="project-partner-visual-head">
              <h3 id="project-ownership-title">Ownership at a glance</h3>
              <p>How the project share is divided.</p>
            </div>
            <div
              className="project-partner-ownership-track"
              role="img"
              aria-label={partners
                .map((partner) => `${partner.name} ${(partner.share_bp / 100).toFixed(2)} percent`)
                .join(", ")}
            >
              {partners.map((partner, index) => (
                <span
                  key={partner.partnership_id}
                  style={{
                    width: `${partner.share_bp / 100}%`,
                    background: colors[index % colors.length],
                  }}
                />
              ))}
              {assignedBp < 10_000 && (
                <span
                  className="is-unassigned"
                  style={{ width: `${(10_000 - assignedBp) / 100}%` }}
                />
              )}
            </div>
            <div className="project-partner-ownership-list">
              {partners.map((partner, index) => (
                <div key={partner.partnership_id}>
                  <i style={{ background: colors[index % colors.length] }} />
                  <span>{partner.name}</span>
                  <strong>{(partner.share_bp / 100).toFixed(2)}%</strong>
                </div>
              ))}
              {assignedBp < 10_000 && (
                <div>
                  <i className="is-unassigned" />
                  <span>Available share</span>
                  <strong>{((10_000 - assignedBp) / 100).toFixed(2)}%</strong>
                </div>
              )}
            </div>
          </section>
          <section className="project-partner-visual" aria-labelledby="project-funding-title">
            <div className="project-partner-visual-head">
              <h3 id="project-funding-title">Money promised and received</h3>
              <p>Payments compared with each partner’s agreed amount.</p>
            </div>
            {committed.length ? (
              <>
                <div className="project-partner-funding-total">
                  <span>
                    Received toward agreements <strong>{formatPKR(committedReceived)}</strong>
                  </span>
                  <span>
                    Agreed <strong>{formatPKR(agreed)}</strong>
                  </span>
                </div>
                <div className="project-partner-funding-list">
                  {committed.map((partner) => {
                    const target = partner.agreed_contribution ?? 0;
                    const due = Math.max(0, target - partner.contributed);
                    return (
                      <div key={partner.partnership_id}>
                        <div className="project-partner-funding-label">
                          <strong>{partner.name}</strong>
                          <span>{due ? `${formatPKR(due)} due` : "Fully received"}</span>
                        </div>
                        <div
                          className="project-partner-funding-track"
                          role="img"
                          aria-label={`${partner.name}: ${formatPKR(partner.contributed)} received, ${formatPKR(due)} remaining`}
                        >
                          <span
                            style={{
                              width: `${target > 0 ? Math.min(100, (partner.contributed / target) * 100) : 100}%`,
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <p className="project-partner-funding-empty">
                No agreed contribution amounts yet. Payments can still be recorded for each partner.
              </p>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
