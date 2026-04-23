"use client";

import { useEffect, useState } from "react";
import { SidebarNav } from "@/components/shell/SidebarNav";
import { TopBar } from "@/components/shell/TopBar";

const THEME_STORAGE_KEY = "greenery-dashboard-theme";

export function AppShell({ children }: { children: React.ReactNode }) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [dark, setDark] = useState(true);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(THEME_STORAGE_KEY);
      if (saved === "light") {
        setDark(false);
        return;
      }
      if (saved === "dark") {
        setDark(true);
        return;
      }
      if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
        setDark(true);
      } else {
        setDark(false);
      }
    } catch {
      /* ignore storage failures */
    }
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, dark ? "dark" : "light");
    } catch {
      /* ignore storage failures */
    }
  }, [dark]);

  return (
    <div className="app-shell flex h-screen min-h-0 flex-col bg-gray-100 text-gray-900 print:h-auto print:min-h-0 dark:bg-[#0b0f19] dark:text-slate-100">
      <div className="flex min-h-0 flex-1 print:h-auto print:min-h-0">
        <SidebarNav collapsed={sidebarCollapsed} />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col print:h-auto print:min-h-0">
          <TopBar
            sidebarCollapsed={sidebarCollapsed}
            onToggleSidebar={() => setSidebarCollapsed((c) => !c)}
            dark={dark}
            onToggleDark={() => setDark((d) => !d)}
          />
          <main className="min-h-0 flex-1 overflow-y-auto bg-gray-100 no-scrollbar print:h-auto print:min-h-0 print:overflow-visible print:bg-white dark:bg-[#0b0f19] dark:print:bg-white">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
