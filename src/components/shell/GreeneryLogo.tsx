import Image from "next/image";

/** Same brand mark as the Greenery product; wordmark for the app shell sidebar. */
export function GreeneryLogo({ collapsed }: { collapsed: boolean }) {
  return (
    <div
      className={`flex items-center gap-2.5 ${collapsed ? "justify-center" : ""}`}
    >
      <Image
        src="/greenery-director-chair-plant-removebg-preview.png"
        alt={collapsed ? "Greenery Productions" : ""}
        width={40}
        height={40}
        className="h-10 w-10 shrink-0 rounded-xl object-contain ring-1 ring-white/10"
        unoptimized
      />
      {!collapsed ? (
        <div className="min-w-0 leading-tight">
          <p className="truncate font-bold tracking-tight text-white">GREENERY</p>
          <p className="truncate text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">
            Productions
          </p>
        </div>
      ) : (
        <span className="sr-only">Greenery Productions</span>
      )}
    </div>
  );
}
