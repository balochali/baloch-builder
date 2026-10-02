import { NavLink, useLocation } from "react-router-dom";
import { useEffect, useRef, type CSSProperties } from "react";
import "./sidebar.css";
import {
  Landmark,
  LayoutDashboard,
  MapPin,
  FolderKanban,
  Users,
  Wallet,
  ReceiptText,
  BookUser,
  Settings,
  Building2,
  HardDrive,
  ArrowUpRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

const groups = [
  {
    label: "WORKSPACE",
    items: [
      { to: "/", label: "Dashboard", icon: LayoutDashboard, color: "#3b82f6" },
      { to: "/projects", label: "Projects", icon: FolderKanban, color: "#a855f7" },
      { to: "/land", label: "Land", icon: MapPin, color: "#f59e0b" },
    ],
  },
  {
    label: "PEOPLE & MONEY",
    items: [
      { to: "/contacts", label: "Contacts", icon: BookUser, color: "#06b6d4" },
      { to: "/partners", label: "Partners", icon: Users, color: "#f97316" },
      { to: "/personal-expense", label: "Personal Expense", icon: ReceiptText, color: "#ec4899" },
      { to: "/bank", label: "Bank", icon: Landmark, color: "#10b981" },
      { to: "/credit-udhaar", label: "Credit / Udhaar", icon: Wallet, color: "#8b5cf6" },
    ],
  },
];
export function Sidebar() {
  const { pathname } = useLocation();
  const navRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!window.matchMedia("(max-width: 760px)").matches) return;
    const nav = navRef.current;
    const active = nav?.querySelector<HTMLElement>(".workspace-nav-link.is-active");
    if (!nav || !active) return;
    const navBounds = nav.getBoundingClientRect();
    const activeBounds = active.getBoundingClientRect();
    nav.scrollLeft +=
      activeBounds.left - navBounds.left - (navBounds.width - activeBounds.width) / 2;
  }, [pathname]);
  return (
    <aside className="app-sidebar">
      <NavLink to="/" className="brand-block" aria-label="Baloch Builders dashboard">
        <span className="workspace-logo">
          <Building2 size={25} />
        </span>
        <span className="brand-name">
          <strong>BALOCH</strong>
          <small>BUILDERS & DEVELOPERS</small>
        </span>
      </NavLink>
      <nav ref={navRef} aria-label="Main navigation">
        {groups.map((group) => (
          <div className="nav-group" key={group.label}>
            <p className="sidebar-caption">{group.label}</p>
            {group.items.map(({ to, label, icon: Icon, color }) => (
              <NavLink
                key={to}
                to={to}
                end={to === "/"}
                style={{ "--nav-color": color } as CSSProperties}
                className={({ isActive }) => cn("workspace-nav-link", isActive && "is-active")}
              >
                <span className="sidebar-link-icon">
                  <Icon size={19} aria-hidden="true" />
                </span>
                <span className="sidebar-link-label">{label}</span>
              </NavLink>
            ))}
          </div>
        ))}
      </nav>
      <div className="sidebar-bottom">
        <div className="workspace-local">
          <span className="sidebar-local-icon">
            <HardDrive size={18} aria-hidden="true" />
          </span>
          <div>
            <strong>Your local workspace</strong>
            <span>Records stored on this device</span>
          </div>
        </div>
        <NavLink
          to="/settings"
          style={{ "--nav-color": "#94a3b8" } as CSSProperties}
          className={({ isActive }) => cn("workspace-nav-link", isActive && "is-active")}
        >
          <span className="sidebar-link-icon">
            <Settings size={19} aria-hidden="true" />
          </span>
          <span className="sidebar-link-label">Settings</span>
          <ArrowUpRight className="sidebar-settings-arrow" size={15} aria-hidden="true" />
        </NavLink>
      </div>
    </aside>
  );
}
