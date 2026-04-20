/**
 * Single source of truth for dashboard sidebar: departments, operations,
 * management, and coming-soon module metadata (scalable product roadmap).
 */

import type { NavIconId } from "@/components/shell/nav-icons";

export type ModuleStatus = "live" | "coming_soon";

export interface DepartmentModuleDef {
  id: string;
  label: string;
  /** Present when live; coming_soon uses `/coming-soon/[moduleId]`. */
  href?: string;
  status: ModuleStatus;
  badge?: number;
  icon?: NavIconId;
}

export interface DepartmentDef {
  id: string;
  name: string;
  description: string;
  modules: DepartmentModuleDef[];
}

export interface OperationsItemDef {
  id: string;
  label: string;
  href?: string;
  status: ModuleStatus;
  badge?: number;
  icon: NavIconId;
}

export interface ManagementItemDef {
  id: string;
  label: string;
  href?: string;
  status: ModuleStatus;
  badge?: number;
  icon: NavIconId;
}

export interface AnalyticsItemDef {
  id: string;
  label: string;
  href?: string;
  status: ModuleStatus;
  icon: NavIconId;
}

/** Full-page placeholder content keyed by `moduleId` (path segment). */
export interface ComingSoonModuleCopy {
  moduleId: string;
  headline: string;
  subhead: string;
  bullets: string[];
  departmentName: string;
}

export const MAINTENANCE_DEPARTMENT_ID = "maintenance";

export const MAINTENANCE_DEPARTMENT_SUMMARY = {
  id: MAINTENANCE_DEPARTMENT_ID,
  name: "Maintenance Department",
  description:
    "Interior plant programs, installs, rotations, and client proposals.",
} as const;

/** Departments other than Maintenance (sidebar modules + coming-soon copy). */
export const DEPARTMENTS: DepartmentDef[] = [
  {
    id: "floral",
    name: "Floral Department",
    description:
      "Seasonal color rotations, lobby refreshes, and event-specific floral.",
    modules: [
      {
        id: "floral-programs",
        label: "Recurring programs",
        status: "coming_soon",
        icon: "sprout",
      },
      {
        id: "floral-events",
        label: "Event installs",
        status: "coming_soon",
        icon: "calendar",
      },
      {
        id: "floral-growers",
        label: "Grower coordination",
        status: "coming_soon",
        icon: "user",
      },
    ],
  },
  {
    id: "events",
    name: "Events Department",
    description:
      "Load-in/out schedules, venue staging, and rental inventory for one-off experiences.",
    modules: [
      {
        id: "events-schedules",
        label: "Load-in / load-out",
        status: "coming_soon",
        icon: "calendar",
      },
      {
        id: "events-staging",
        label: "Venue staging packages",
        status: "coming_soon",
        icon: "building",
      },
      {
        id: "events-rentals",
        label: "Rental inventory",
        status: "coming_soon",
        icon: "inventory",
      },
    ],
  },
  {
    id: "christmas",
    name: "Christmas Department",
    description:
      "Seasonal décor install and removal windows, packages, and off-season storage.",
    modules: [
      {
        id: "christmas-windows",
        label: "Install & removal windows",
        status: "coming_soon",
        icon: "calendar",
      },
      {
        id: "christmas-packages",
        label: "Décor packages",
        status: "coming_soon",
        icon: "inventory",
      },
      {
        id: "christmas-storage",
        label: "Storage logistics",
        status: "coming_soon",
        icon: "clipboard",
      },
    ],
  },
  {
    id: "sales",
    name: "Sales Department",
    description:
      "Pipeline visibility, quote versioning, and smooth handoff to operations.",
    modules: [
      {
        id: "sales-pipeline",
        label: "Pipeline",
        status: "coming_soon",
        icon: "clipboard",
      },
      {
        id: "sales-quotes",
        label: "Quote versioning",
        status: "coming_soon",
        icon: "file-text",
      },
      {
        id: "sales-crm",
        label: "CRM handoff",
        status: "coming_soon",
        icon: "user",
      },
    ],
  },
  {
    id: "marketing",
    name: "Marketing Department",
    description:
      "Branded proposal assets, photography standards, and client-facing templates.",
    modules: [
      {
        id: "marketing-branding",
        label: "Proposal branding packs",
        status: "coming_soon",
        icon: "file-text",
      },
      {
        id: "marketing-photos",
        label: "Photo standards",
        status: "coming_soon",
        icon: "sprout",
      },
      {
        id: "marketing-assets",
        label: "Client-facing assets",
        status: "coming_soon",
        icon: "clipboard",
      },
    ],
  },
];

/** All departments in sidebar switcher order (Maintenance first). */
export const SIDEBAR_DEPARTMENT_OPTIONS: {
  id: string;
  name: string;
  description: string;
}[] = [MAINTENANCE_DEPARTMENT_SUMMARY, ...DEPARTMENTS];

export const SELECTED_DEPT_STORAGE_KEY = "greenery-sidebar-department";

export const OPERATIONS_ITEMS: OperationsItemDef[] = [
  {
    id: "ops-maintenance-dep",
    label: "Maintenance Dep",
    href: "/maintenance/proposals",
    status: "live",
    icon: "building",
  },
  {
    id: "ops-work-orders",
    label: "Work Orders",
    status: "coming_soon",
    icon: "user",
  },
  {
    id: "ops-quality-control",
    label: "Quality Control",
    status: "coming_soon",
    icon: "shield-check",
  },
  {
    id: "ops-rotations",
    label: "Worksheet Rotations",
    status: "coming_soon",
    icon: "grid",
  },
  {
    id: "ops-proposals",
    label: "Proposals",
    href: "/maintenance/proposals",
    status: "live",
    icon: "file-text",
  },
];

export const MANAGEMENT_ITEMS: ManagementItemDef[] = [
  {
    id: "mgmt-approvals",
    label: "Approvals",
    status: "coming_soon",
    badge: 4,
    icon: "approvals",
  },
  { id: "mgmt-contracts", label: "Contracts", status: "coming_soon", icon: "contracts" },
  { id: "mgmt-prebook", label: "Prebook", status: "coming_soon", icon: "cart" },
  {
    id: "mgmt-grower-invoices",
    label: "Grower Invoices",
    status: "coming_soon",
    icon: "invoice",
  },
  { id: "mgmt-schedules", label: "Schedules", status: "coming_soon", icon: "calendar" },
  { id: "mgmt-inventory", label: "Inventory", status: "coming_soon", icon: "inventory" },
  { id: "mgmt-report-706", label: "Report 706", status: "coming_soon", icon: "report706" },
];

export const ANALYTICS_ITEMS: AnalyticsItemDef[] = [
  { id: "analytics-reports", label: "Reports", status: "coming_soon", icon: "reports" },
];

const COMING_SOON_COPY: Record<string, ComingSoonModuleCopy> = {};

function registerCopy(copy: ComingSoonModuleCopy) {
  COMING_SOON_COPY[copy.moduleId] = copy;
}

for (const dept of DEPARTMENTS) {
  for (const mod of dept.modules) {
    if (mod.status === "coming_soon") {
      registerCopy({
        moduleId: mod.id,
        departmentName: dept.name,
        headline: mod.label,
        subhead: `${dept.name} — this module is on the roadmap. Greenery can prioritize it based on your rollout plan.`,
        bullets: [
          dept.description,
          "Designed to plug into the same operations hub you use today.",
          "Ask your Greenery contact to bump this module up the build queue.",
        ],
      });
    }
  }
}

for (const item of OPERATIONS_ITEMS) {
  if (item.status === "coming_soon" && !COMING_SOON_COPY[item.id]) {
    registerCopy({
      moduleId: item.id,
      departmentName: "Operations",
      headline: item.label,
      subhead:
        "Operations tooling for Greenery crews — scheduled for a future release.",
      bullets: [
        "Will connect with proposals, work orders, and maintenance schedules.",
        "Under active product design.",
      ],
    });
  }
}

for (const item of MANAGEMENT_ITEMS) {
  if (item.status === "coming_soon" && !COMING_SOON_COPY[item.id]) {
    registerCopy({
      moduleId: item.id,
      departmentName: "Management",
      headline: item.label,
      subhead:
        "Back-office and approvals workflows — planned as part of the Greenery platform expansion.",
      bullets: [
        "Centralized visibility for finance and operations leadership.",
        "Tell us which management views you need first.",
      ],
    });
  }
}

for (const item of ANALYTICS_ITEMS) {
  if (item.status === "coming_soon") {
    registerCopy({
      moduleId: item.id,
      departmentName: "Analytics",
      headline: item.label,
      subhead:
        "Reporting and KPI dashboards — coming as your data footprint grows.",
      bullets: [
        "Export-friendly summaries aligned with maintenance revenue.",
        "We can tailor metrics to your account structure.",
      ],
    });
  }
}

type NavLinkable =
  | DepartmentModuleDef
  | OperationsItemDef
  | ManagementItemDef
  | AnalyticsItemDef;

export function hrefForModule(mod: NavLinkable): string {
  if (mod.status === "live" && mod.href) return mod.href;
  return `/coming-soon/${mod.id}`;
}

export function getComingSoonCopy(moduleId: string): ComingSoonModuleCopy | null {
  return COMING_SOON_COPY[moduleId] ?? null;
}

export const DEFAULT_COMING_SOON: ComingSoonModuleCopy = {
  moduleId: "unknown",
  departmentName: "Greenery",
  headline: "Module under construction",
  subhead:
    "This area is part of the Greenery roadmap. Your team is already on the platform — new modules roll out here first.",
  bullets: [
    "Scalable architecture: each department gets its own lane without breaking existing flows.",
    "Contact Greenery to prioritize what we build next.",
  ],
};

export function getDepartmentById(
  departmentId: string,
): { id: string; name: string; description: string } | undefined {
  return SIDEBAR_DEPARTMENT_OPTIONS.find((d) => d.id === departmentId);
}

export function defaultRouteForDepartment(departmentId: string): string {
  if (departmentId === MAINTENANCE_DEPARTMENT_ID) return "/maintenance/proposals";
  const dept = DEPARTMENTS.find((d) => d.id === departmentId);
  const first = dept?.modules[0];
  if (first) return hrefForModule(first);
  return "/maintenance/proposals";
}

/** Align sidebar department switcher with the current URL when possible. */
export function resolveDepartmentIdFromPathname(pathname: string | null): string | null {
  if (!pathname) return null;
  if (pathname === "/" || pathname.startsWith("/maintenance")) {
    return MAINTENANCE_DEPARTMENT_ID;
  }
  const match = pathname.match(/^\/coming-soon\/([^/?#]+)/);
  if (!match) return null;
  const moduleId = match[1];
  if (OPERATIONS_ITEMS.some((i) => i.id === moduleId)) return MAINTENANCE_DEPARTMENT_ID;
  if (MANAGEMENT_ITEMS.some((i) => i.id === moduleId)) return MAINTENANCE_DEPARTMENT_ID;
  if (ANALYTICS_ITEMS.some((i) => i.id === moduleId)) return MAINTENANCE_DEPARTMENT_ID;
  for (const d of DEPARTMENTS) {
    if (d.modules.some((m) => m.id === moduleId)) return d.id;
  }
  return null;
}
