import { NavLink } from "react-router-dom";
import {
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
      { to: "/", label: "Dashboard", icon: LayoutDashboard },
      { to: "/projects", label: "Projects", icon: FolderKanban },
      { to: "/land", label: "Land", icon: MapPin },
    ],
  },
  {
    label: "PEOPLE & MONEY",
    items: [
      { to: "/contacts", label: "Contacts", icon: BookUser },
      { to: "/partners", label: "Partners", icon: Users },
      { to: "/personal-expense", label: "Personal Expense", icon: ReceiptText },
      { to: "/credit-udhaar", label: "Credit / Udhaar", icon: Wallet },
    ],
  },
];
export function Sidebar() {
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
      <nav aria-label="Main navigation">
        {groups.map((group) => (
          <div className="nav-group" key={group.label}>
            <p className="sidebar-caption">{group.label}</p>
            {group.items.map(({ to, label, icon: Icon, ...item }) => (
              <NavLink
                key={to}
                to={to}
                end={to === "/"}
                className={({ isActive }) => cn("workspace-nav-link", isActive && "is-active")}
              >
                <Icon size={19} />
                <span>{label}</span>
                {"soon" in item && <small>Soon</small>}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>
      <div className="sidebar-bottom">
        <div className="workspace-local">
          <HardDrive size={18} />
          <div>
            <strong>Your local workspace</strong>
            <span>Records stored on this device</span>
          </div>
        </div>
        <NavLink
          to="/settings"
          className={({ isActive }) => cn("workspace-nav-link", isActive && "is-active")}
        >
          <Settings size={19} />
          <span>Settings</span>
          <ArrowUpRight size={15} />
        </NavLink>
      </div>
    </aside>
  );
}
