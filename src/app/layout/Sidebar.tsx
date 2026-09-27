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
} from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/contacts", label: "Contacts", icon: BookUser },
  { to: "/land", label: "Land", icon: MapPin },
  { to: "/projects", label: "Projects", icon: FolderKanban },
  { to: "/partners", label: "Partners", icon: Users },
  { to: "/personal-expense", label: "Personal Expense", icon: ReceiptText },
  { to: "/credit-udhaar", label: "Credit / Udhaar", icon: Wallet },
];

export function Sidebar() {
  return (
    <aside className="app-sidebar flex flex-col w-60 min-h-screen bg-sidebar border-r border-sidebar-border shrink-0">
      {/* Brand */}
      <div className="brand-block border-b border-sidebar-border">
        <span className="brand-mark" role="img" aria-label="Baloch Builders logo" />
        <span className="brand-name"><strong>BALOCH</strong><small>BUILDERS & DEVELOPERS</small></span>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-4 space-y-0.5 px-2" aria-label="Main navigation">
        <p className="sidebar-caption">WORKSPACE</p>
        {navItems.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            id={`nav-${label.toLowerCase()}`}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                isActive
                  ? "bg-sidebar-primary text-sidebar-primary-foreground"
                  : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              )
            }
          >
            <Icon className="size-4 shrink-0" />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* Settings at bottom */}
      <div className="px-2 pb-4 border-t border-sidebar-border pt-4">
        <NavLink
          to="/settings"
          id="nav-settings"
          className={({ isActive }) =>
            cn(
              "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
              isActive
                ? "bg-sidebar-primary text-sidebar-primary-foreground"
                : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
            )
          }
        >
          <Settings className="size-4 shrink-0" />
          Settings
        </NavLink>
      </div>
    </aside>
  );
}
