import type { LucideIcon } from "lucide-react";
import {
  ArrowLeftRight,
  BarChart3,
  Building2,
  Calendar,
  CheckCircle2,
  ClipboardList,
  FileText,
  LayoutGrid,
  Package,
  ShoppingCart,
  ShieldCheck,
  Sprout,
  User,
} from "lucide-react";

export type NavIconId =
  | "building"
  | "user"
  | "shield-check"
  | "grid"
  | "file-text"
  | "approvals"
  | "contracts"
  | "cart"
  | "invoice"
  | "calendar"
  | "inventory"
  | "report706"
  | "reports"
  | "sprout"
  | "clipboard";

const MAP: Record<NavIconId, LucideIcon> = {
  building: Building2,
  user: User,
  "shield-check": ShieldCheck,
  grid: LayoutGrid,
  "file-text": FileText,
  approvals: CheckCircle2,
  contracts: FileText,
  cart: ShoppingCart,
  invoice: ClipboardList,
  calendar: Calendar,
  inventory: Package,
  report706: ArrowLeftRight,
  reports: BarChart3,
  sprout: Sprout,
  clipboard: ClipboardList,
};

export function NavIcon({
  id,
  className,
}: {
  id: NavIconId;
  className?: string;
}) {
  const Icon = MAP[id];
  return <Icon className={className ?? "h-[18px] w-[18px] shrink-0"} strokeWidth={1.75} />;
}
