import {can,type Role} from "@baloch/shared";
import { NavLink, useLocation } from "react-router-dom";
import { useEffect, useRef, type CSSProperties } from "react";
import "./sidebar.css";
import buildingElevation from "@/assets/building-elevation.svg";
import {
  Landmark,
  LayoutDashboard,
  MapPin,
  Users,
  Wallet,
  ShieldCheck,
  ReceiptText,
  BookUser,
  Settings,
  Building2,
  HardDrive,
  FolderOpen,
  ArrowUpRight,
  LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils";

const groups = [
  {
    label: "WORKSPACE",
    items: [
      { to: "/", label: "Dashboard", icon: LayoutDashboard, color: "#3b82f6" },
      { to: "/projects", label: "Projects", icon: Building2, color: "#d2ad65" },
      { to: "/land", label: "Land", icon: MapPin, color: "#f59e0b" },
      { to: "/documents", label: "Documents", icon: FolderOpen, color: "#6366f1" },
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
      { to: "/personal-deposit", label: "Personal Deposit", icon: ShieldCheck, color: "#2dd4bf" },
    ],
  },
];
interface SidebarProps {
  onLogout: () => void;
  onNavigate?: () => void;
  role?: Role;
}

export function Sidebar({ onLogout, onNavigate, role }: SidebarProps) {
  const { pathname } = useLocation();
  const visibleGroups = role ? [
    {label:"WORKSPACE",items:[{to:"/projects",label:"Projects",icon:Building2,color:"#d2ad65"}]},
    {label:"PEOPLE & MONEY",items:[
      ...(can(role,"costHeads")?[{to:"/cost-heads",label:"Cost heads",icon:Wallet,color:"#8b5cf6"}]:[]),
      ...(can(role,"ledger")?[{to:"/vouchers",label:"Vouchers",icon:ReceiptText,color:"#ec4899"},{to:"/journal",label:"General journal",icon:BookUser,color:"#06b6d4"},{to:"/trial-balance",label:"Trial Balance",icon:Landmark,color:"#10b981"},{to:"/accounts",label:"Chart of accounts",icon:Wallet,color:"#8b5cf6"},{to:"/periods",label:"Fiscal periods",icon:ShieldCheck,color:"#2dd4bf"}]:[]),
      ...(can(role,"users")?[{to:"/users",label:"Users and roles",icon:Users,color:"#f97316"},{to:"/assignments",label:"Project assignments",icon:BookUser,color:"#06b6d4"},{to:"/audit",label:"Audit log",icon:ShieldCheck,color:"#2dd4bf"}]:[])
    ]}
  ].filter(group=>group.items.length) : groups;
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
    <aside
      className="app-sidebar"
      onClick={(event) => {
        if ((event.target as HTMLElement).closest("a")) onNavigate?.();
      }}
    >
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
        {visibleGroups.map((group) => (
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
      <div className="sidebar-building-scene" aria-hidden="true">
        <img src={buildingElevation} alt="" />
        <span>From foundation to skyline</span>
      </div>
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
        {(!role || can(role,"settings")) && <NavLink
          to="/settings"
          style={{ "--nav-color": "#94a3b8" } as CSSProperties}
          className={({ isActive }) => cn("workspace-nav-link", isActive && "is-active")}
        >
          <span className="sidebar-link-icon">
            <Settings size={19} aria-hidden="true" />
          </span>
          <span className="sidebar-link-label">Settings</span>
          <ArrowUpRight className="sidebar-settings-arrow" size={15} aria-hidden="true" />
        </NavLink>}
        <button
          type="button"
          className="workspace-nav-link sidebar-logout"
          aria-label="Log out"
          onClick={onLogout}
        >
          <span className="sidebar-link-icon">
            <LogOut size={19} aria-hidden="true" />
          </span>
          <span className="sidebar-link-label">Log out</span>
        </button>
      </div>
    </aside>
  );
}
