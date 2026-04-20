"use client";

import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronsUpDown } from "lucide-react";
import { GreeneryLogo } from "@/components/shell/GreeneryLogo";
import { NavIcon, type NavIconId } from "@/components/shell/nav-icons";
import {
  ANALYTICS_ITEMS,
  DEPARTMENTS,
  MAINTENANCE_DEPARTMENT_ID,
  MANAGEMENT_ITEMS,
  OPERATIONS_ITEMS,
  SELECTED_DEPT_STORAGE_KEY,
  SIDEBAR_DEPARTMENT_OPTIONS,
  defaultRouteForDepartment,
  hrefForModule,
  resolveDepartmentIdFromPathname,
} from "@/config/app-navigation";

const ACTIVE_CLASS =
  "bg-gradient-to-r from-emerald-500 to-emerald-600 text-white shadow-md shadow-emerald-900/30";
const INACTIVE_CLASS =
  "text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-slate-300 dark:hover:bg-white/5 dark:hover:text-white";

function NavRow({
  href,
  active,
  collapsed,
  children,
  badge,
  iconId,
}: {
  href: string;
  active: boolean;
  collapsed: boolean;
  children: React.ReactNode;
  badge?: number;
  iconId: NavIconId;
}) {
  return (
    <Link
      href={href}
      title={collapsed ? String(children) : undefined}
      className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
        active ? ACTIVE_CLASS : INACTIVE_CLASS
      } ${collapsed ? "justify-center px-2" : ""}`}
    >
      <NavIcon
        id={iconId}
        className={`h-[18px] w-[18px] shrink-0 ${active ? "text-white" : "text-gray-400 dark:text-slate-400"}`}
      />
      <span className={collapsed ? "sr-only" : "min-w-0 flex-1 truncate"}>{children}</span>
      {!collapsed && badge != null && badge > 0 ? (
        <span className="shrink-0 rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-bold text-white">
          {badge > 99 ? "99+" : badge}
        </span>
      ) : null}
    </Link>
  );
}

export function SidebarNav({ collapsed }: { collapsed: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const [deptMenuOpen, setDeptMenuOpen] = useState(false);
  const deptMenuRef = useRef<HTMLDivElement>(null);

  const [selectedDeptId, setSelectedDeptId] = useState(MAINTENANCE_DEPARTMENT_ID);

  useEffect(() => {
    const resolved = resolveDepartmentIdFromPathname(pathname);
    if (resolved) {
      setSelectedDeptId(resolved);
      try {
        localStorage.setItem(SELECTED_DEPT_STORAGE_KEY, resolved);
      } catch {
        /* ignore */
      }
    }
  }, [pathname]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!deptMenuRef.current?.contains(e.target as Node)) setDeptMenuOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const currentDept = SIDEBAR_DEPARTMENT_OPTIONS.find((d) => d.id === selectedDeptId);
  const operationsForDept =
    selectedDeptId === MAINTENANCE_DEPARTMENT_ID
      ? OPERATIONS_ITEMS
      : DEPARTMENTS.find((d) => d.id === selectedDeptId)?.modules ?? [];

  const pickDepartment = useCallback(
    (id: string) => {
      setDeptMenuOpen(false);
      if (id === selectedDeptId) return;
      const dest = defaultRouteForDepartment(id);
      router.push(dest);
    },
    [router, selectedDeptId],
  );

  function operationActive(
    item: (typeof OPERATIONS_ITEMS)[number] | (typeof DEPARTMENTS)[number]["modules"][number],
    href: string,
  ): boolean {
    if (selectedDeptId !== MAINTENANCE_DEPARTMENT_ID) {
      return (
        pathname === href ||
        (!!item.href && pathname.startsWith(`${item.href}/`))
      );
    }
    if (item.id === "ops-proposals") {
      return pathname.startsWith("/maintenance/proposals");
    }
    if (item.id === "ops-maintenance-dep") {
      return pathname === "/maintenance/proposals";
    }
    return pathname === href || (!!item.href && pathname.startsWith(`${item.href}/`));
  }

  return (
    <nav
      className={`relative flex h-full flex-col border-r border-gray-200 bg-white dark:border-slate-800/80 dark:bg-[#0c1222] ${
        collapsed ? "w-[72px]" : "w-64"
      }`}
    >
      <div
        className={`flex shrink-0 items-center border-b border-gray-200 px-3 py-4 dark:border-slate-800/80 ${
          collapsed ? "justify-center" : ""
        }`}
      >
        <GreeneryLogo collapsed={collapsed} />
      </div>

      <div className="relative z-20 border-b border-gray-200 p-3 dark:border-slate-800/80" ref={deptMenuRef}>
        {!collapsed ? (
          <>
            <p className="mb-2 px-1 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-500">
              Department
            </p>
            <div className="relative">
              <button
                type="button"
                onClick={() => setDeptMenuOpen((o) => !o)}
                className="flex w-full items-center justify-between gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-left text-sm text-gray-900 transition hover:border-gray-400 hover:bg-gray-50 dark:border-slate-700/80 dark:bg-slate-900/60 dark:text-white dark:hover:border-slate-600 dark:hover:bg-slate-800/80"
                aria-expanded={deptMenuOpen}
                aria-haspopup="listbox"
              >
                <span className="min-w-0 flex-1 truncate font-medium">
                  {currentDept?.name ?? "Department"}
                </span>
                <ChevronDown
                  className={`h-4 w-4 shrink-0 text-gray-400 transition dark:text-slate-400 ${deptMenuOpen ? "rotate-180" : ""}`}
                />
              </button>
              {deptMenuOpen ? (
                <ul
                  className="absolute left-0 right-0 z-50 mt-1 max-h-64 overflow-y-auto rounded-lg border border-gray-300 bg-white py-1 shadow-xl dark:border-slate-700 dark:bg-[#111827]"
                  role="listbox"
                >
                  {SIDEBAR_DEPARTMENT_OPTIONS.map((opt) => (
                    <li key={opt.id} role="presentation">
                      <button
                        type="button"
                        role="option"
                        aria-selected={opt.id === selectedDeptId}
                        onClick={() => pickDepartment(opt.id)}
                        className={`flex w-full flex-col items-start gap-0.5 px-3 py-2.5 text-left text-sm transition hover:bg-gray-100 dark:hover:bg-white/5 ${
                          opt.id === selectedDeptId
                            ? "bg-emerald-100 text-emerald-900 dark:bg-emerald-600/20 dark:text-emerald-200"
                            : "text-gray-700 dark:text-slate-200"
                        }`}
                      >
                        <span className="font-medium">{opt.name}</span>
                        <span className="text-[11px] leading-snug text-slate-500 dark:text-slate-500">{opt.description}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </>
        ) : (
          <div className="relative flex justify-center">
            <button
              type="button"
              onClick={() => setDeptMenuOpen((o) => !o)}
              className="flex h-10 w-10 items-center justify-center rounded-lg border border-gray-300 bg-white text-gray-600 hover:bg-gray-50 dark:border-slate-700/80 dark:bg-slate-900/60 dark:text-slate-300 dark:hover:bg-slate-800"
              aria-label="Select department"
              title="Department"
            >
              <ChevronsUpDown className="h-5 w-5" />
            </button>
            {deptMenuOpen ? (
              <ul
                className="absolute left-full top-0 z-50 ml-1 max-h-72 w-64 overflow-y-auto rounded-lg border border-gray-300 bg-white py-1 shadow-xl dark:border-slate-700 dark:bg-[#111827]"
                role="listbox"
              >
                {SIDEBAR_DEPARTMENT_OPTIONS.map((opt) => (
                  <li key={opt.id} role="presentation">
                    <button
                      type="button"
                      role="option"
                      aria-selected={opt.id === selectedDeptId}
                      onClick={() => pickDepartment(opt.id)}
                      className={`flex w-full flex-col items-start gap-0.5 px-3 py-2.5 text-left text-sm transition hover:bg-gray-100 dark:hover:bg-white/5 ${
                        opt.id === selectedDeptId
                          ? "bg-emerald-100 text-emerald-900 dark:bg-emerald-600/20 dark:text-emerald-200"
                          : "text-gray-700 dark:text-slate-200"
                      }`}
                    >
                      <span className="font-medium">{opt.name}</span>
                      <span className="text-[11px] text-slate-500 dark:text-slate-500">{opt.description}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-3">
        <div>
          {!collapsed ? (
            <p className="mb-2 px-2 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-500">
              Operations
            </p>
          ) : null}
          <ul className="space-y-0.5">
            {operationsForDept.map((item) => {
              const href = hrefForModule(item);
              const icon: NavIconId =
                "icon" in item && item.icon ? item.icon : "clipboard";
              const active = operationActive(item, href);
              return (
                <li key={item.id}>
                  <NavRow href={href} active={active} collapsed={collapsed} badge={item.badge} iconId={icon}>
                    {item.label}
                  </NavRow>
                </li>
              );
            })}
          </ul>
        </div>

        <div>
          {!collapsed ? (
            <p className="mb-2 px-2 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-500">
              Management
            </p>
          ) : null}
          <ul className="space-y-0.5">
            {MANAGEMENT_ITEMS.map((item) => {
              const href = hrefForModule(item);
              const active = pathname === href;
              return (
                <li key={item.id}>
                  <NavRow
                    href={href}
                    active={active}
                    collapsed={collapsed}
                    badge={item.badge}
                    iconId={item.icon}
                  >
                    {item.label}
                  </NavRow>
                </li>
              );
            })}
          </ul>
        </div>

        <div>
          {!collapsed ? (
            <p className="mb-2 px-2 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-500">
              Analytics
            </p>
          ) : null}
          <ul className="space-y-0.5">
            {ANALYTICS_ITEMS.map((item) => {
              const href = hrefForModule(item);
              const active = pathname === href;
              return (
                <li key={item.id}>
                  <NavRow href={href} active={active} collapsed={collapsed} iconId={item.icon}>
                    {item.label}
                  </NavRow>
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      <div
        className={`shrink-0 border-t border-gray-200 p-3 dark:border-slate-800/80 ${
          collapsed ? "flex justify-center" : ""
        }`}
      >
        <div
          className={`flex items-center gap-2 rounded-lg bg-gray-50 px-2 py-2 ring-1 ring-gray-200 dark:bg-slate-900/50 dark:ring-slate-800/80 ${
            collapsed ? "justify-center" : ""
          }`}
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-sm font-bold text-white">
            A
          </div>
          {!collapsed ? (
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold text-gray-900 dark:text-white">Admin User</p>
              <p className="truncate text-[10px] text-slate-500 dark:text-slate-500">General Manager</p>
            </div>
          ) : null}
        </div>
      </div>
    </nav>
  );
}
