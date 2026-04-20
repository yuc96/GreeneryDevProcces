"use client";

import { useEffect, useState } from "react";
import { SidebarNav } from "@/components/shell/SidebarNav";
import { TopBar } from "@/components/shell/TopBar";

export function AppShell({ children }: { children: React.ReactNode }) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [dark, setDark] = useState(true);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

  return (
    <div className="flex h-screen min-h-0 flex-col bg-[#0b0f19] text-slate-100">
      <div className="flex min-h-0 flex-1">
        <SidebarNav collapsed={sidebarCollapsed} />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <TopBar
            sidebarCollapsed={sidebarCollapsed}
            onToggleSidebar={() => setSidebarCollapsed((c) => !c)}
            dark={dark}
            onToggleDark={() => setDark((d) => !d)}
          />
          <main className="min-h-0 flex-1 overflow-y-auto bg-[#0b0f19] no-scrollbar">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
