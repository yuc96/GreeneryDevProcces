"use client";

import { Menu, Moon, PanelLeftClose, Sun } from "lucide-react";

const ACCENT = "#2b7041";

export function TopBar({
  sidebarCollapsed,
  onToggleSidebar,
  dark,
  onToggleDark,
}: {
  sidebarCollapsed: boolean;
  onToggleSidebar: () => void;
  dark: boolean;
  onToggleDark: () => void;
}) {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-slate-800/80 bg-[#0b0f19] px-4 text-slate-200">
      <button
        type="button"
        onClick={onToggleSidebar}
        className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-400 hover:bg-white/5 hover:text-white"
        aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
      >
        {sidebarCollapsed ? (
          <Menu className="h-5 w-5" />
        ) : (
          <PanelLeftClose className="h-5 w-5" />
        )}
      </button>
      <button
        type="button"
        onClick={onToggleDark}
        className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-400 hover:bg-white/5 hover:text-white"
        aria-label="Toggle theme"
      >
        {dark ? (
          <Sun className="h-5 w-5" style={{ color: ACCENT }} />
        ) : (
          <Moon className="h-5 w-5" />
        )}
      </button>
    </header>
  );
}
