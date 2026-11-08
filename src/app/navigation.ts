import {
  LayoutDashboard,
  Building2,
  MapPin,
  Users,
  PlusCircle,
  BookOpen,
  Landmark,
  Wallet,
  Contact,
  ChartColumn,
  ListTree,
  Settings,
} from "lucide-react";
export const navigation = [
  {
    label: "WORKSPACE",
    items: [
      { to: "/", label: "Dashboard", icon: LayoutDashboard, permission: "projects", tabs: [] },
      {
        to: "/projects",
        label: "Projects",
        icon: Building2,
        permission: "projects",
        tabs: [
          { label: "Overview", slug: "overview" },
          { label: "Transactions", slug: "transactions" },
          { label: "Partners", slug: "partners" },
          { label: "Parties", slug: "parties" },
          { label: "Documents", slug: "documents" },
        ],
      },
      {
        to: "/land",
        label: "Lands (overview of all land)",
        icon: MapPin,
        permission: "projects",
        tabs: [
          { label: "Land List", slug: "land-list" },
          { label: "Purchases & Payments", slug: "purchases-payments" },
          { label: "Documents", slug: "documents" },
        ],
      },
      {
        to: "/partners",
        label: "Partners",
        icon: Users,
        permission: "ledger",
        tabs: [
          { label: "Partner List", slug: "partner-list" },
          { label: "Investments", slug: "investments" },
          { label: "Profit Share", slug: "profit-share" },
          { label: "Statement", slug: "statement" },
        ],
      },
    ],
  },
  {
    label: "MONEY",
    items: [
      { to: "/add-entry", label: "Add Entry", icon: PlusCircle, permission: "ledger", tabs: [] },
      {
        to: "/ledger",
        label: "Ledger",
        icon: BookOpen,
        permission: "ledger",
        tabs: [
          { label: "Cash", slug: "cash" },
          { label: "Bank", slug: "bank" },
          { label: "All Accounts", slug: "all-accounts" },
          { label: "Journal", slug: "journal" },
        ],
      },
      {
        to: "/bank",
        label: "Bank Accounts",
        icon: Landmark,
        permission: "ledger",
        tabs: [
          { label: "Builder", slug: "builder" },
          { label: "Personal", slug: "personal" },
          { label: "Transfers", slug: "transfers" },
        ],
      },
    ],
  },
  {
    label: "PERSONAL",
    items: [
      {
        to: "/personal",
        label: "Personal",
        icon: Wallet,
        permission: "settings",
        tabs: [
          { label: "Expenses", slug: "expenses" },
          { label: "Deposits", slug: "deposits" },
          { label: "Udhaar", slug: "udhaar" },
          { label: "Summary", slug: "summary" },
        ],
      },
    ],
  },
  {
    label: "PARTIES",
    items: [
      {
        to: "/parties",
        label: "Parties",
        icon: Contact,
        permission: "ledger",
        tabs: [
          { label: "Clients", slug: "clients" },
          { label: "Suppliers", slug: "suppliers" },
          { label: "Contractors", slug: "contractors" },
        ],
      },
    ],
  },
  {
    label: "REPORTS",
    items: [
      {
        to: "/reports",
        label: "Reports",
        icon: ChartColumn,
        permission: "ledger",
        tabs: [
          { label: "Trial Balance", slug: "trial-balance" },
          { label: "Profit & Loss", slug: "profit-loss" },
          { label: "Balance Sheet", slug: "balance-sheet" },
          { label: "By Project", slug: "by-project" },
        ],
      },
    ],
  },
  {
    label: "SETUP",
    items: [
      {
        to: "/accounts",
        label: "Chart of Accounts",
        icon: ListTree,
        permission: "accounts",
        tabs: [],
      },
      {
        to: "/settings",
        label: "Settings",
        icon: Settings,
        permission: "settings",
        tabs: [
          { label: "Profile", slug: "profile" },
          { label: "Password", slug: "password" },
          { label: "Backup", slug: "backup" },
          { label: "Preferences", slug: "preferences" },
        ],
      },
    ],
  },
] as const;
