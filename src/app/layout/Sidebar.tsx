import { can, type Role } from "@baloch/shared";
import { NavLink, useLocation } from "react-router-dom";
import { useEffect, useRef, type CSSProperties } from "react";
import "./sidebar.css";
import buildingElevation from "@/assets/building-elevation.svg";
import { Building2, HardDrive, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { navigation } from "../navigation";

interface SidebarProps {
  onLogout: () => void;
  onNavigate?: () => void;
  role?: Role;
}

export function Sidebar({ onLogout, onNavigate, role }: SidebarProps) {
  const { pathname } = useLocation();
  const visibleGroups = navigation
    .map(({ label, items }) => ({
      label,
      items: [...items].filter((item) => !role || can(role, item.permission)),
    }))
    .filter((group) => group.items.length);
  const navRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const update = () =>
      nav.parentElement?.toggleAttribute(
        "data-more",
        nav.scrollTop + nav.clientHeight < nav.scrollHeight - 2,
      );
    const active = nav.querySelector<HTMLElement>(".workspace-nav-link.is-active");
    if (active) {
      const item = active.getBoundingClientRect();
      const viewport = nav.getBoundingClientRect();
      if (item.top < viewport.top) nav.scrollTop += item.top - viewport.top;
      if (item.bottom > viewport.bottom) nav.scrollTop += item.bottom - viewport.bottom;
    }
    update();
    nav.addEventListener("scroll", update, { passive: true });
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    observer?.observe(nav);
    return () => {
      nav.removeEventListener("scroll", update);
      observer?.disconnect();
    };
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
      <div className="sidebar-nav-wrap">
        <nav ref={navRef} aria-label="Main navigation">
          {visibleGroups.map((group) => (
            <div className="nav-group" key={group.label}>
              <p className="sidebar-caption">{group.label}</p>
              {group.items.map(({ to, label, icon: Icon }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={to === "/"}
                  style={{ "--nav-color": "#d2ad65" } as CSSProperties}
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
      </div>
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
