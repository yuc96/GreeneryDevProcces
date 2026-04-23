"use client";

import { createPortal } from "react-dom";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type FocusEvent,
  type ReactNode,
} from "react";

const COPY = {
  gmm: "Guaranteed Monthly Maintenance",
  mm: "Monthly Maintenance",
} as const;

export type MaintenanceTipVariant = keyof typeof COPY;

export function MaintenanceTypeHoverTip({
  variant,
  children,
  fullWidth,
  placement = "bottom",
  className = "",
}: {
  variant: MaintenanceTipVariant;
  children: ReactNode;
  fullWidth?: boolean;
  placement?: "bottom" | "top";
  className?: string;
}) {
  const wrapRef = useRef<HTMLSpanElement>(null);
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [tipStyle, setTipStyle] = useState<CSSProperties>({});

  const accent =
    variant === "gmm"
      ? "border-l-emerald-500 dark:border-l-emerald-400"
      : "border-l-amber-500 dark:border-l-amber-400";

  const positionTip = useCallback(() => {
    const el = wrapRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const gap = 8;
    if (placement === "bottom") {
      setTipStyle({
        position: "fixed",
        top: r.bottom + gap,
        left: r.left + r.width / 2,
        transform: "translateX(-50%)",
        zIndex: 9999,
      });
    } else {
      setTipStyle({
        position: "fixed",
        top: r.top - gap,
        left: r.left + r.width / 2,
        transform: "translate(-50%, -100%)",
        zIndex: 9999,
      });
    }
  }, [placement]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    positionTip();
    const t = window.requestAnimationFrame(() => positionTip());
    window.addEventListener("scroll", positionTip, true);
    window.addEventListener("resize", positionTip);
    return () => {
      window.cancelAnimationFrame(t);
      window.removeEventListener("scroll", positionTip, true);
      window.removeEventListener("resize", positionTip);
    };
  }, [open, positionTip, variant]);

  const show = () => {
    positionTip();
    setOpen(true);
  };

  const hide = () => setOpen(false);

  const handleBlur = (e: FocusEvent<HTMLSpanElement>) => {
    const next = e.relatedTarget as Node | null;
    if (next == null || !e.currentTarget.contains(next)) hide();
  };

  const panel = (
    <span
      role="tooltip"
      style={tipStyle}
      className={`pointer-events-none w-max max-w-[min(280px,calc(100vw-2rem))] rounded-lg border border-gray-200 border-l-[3px] bg-white px-3 py-2 text-left text-xs font-medium leading-snug text-gray-800 shadow-lg ring-1 ring-black/[0.04] dark:border-slate-600 dark:bg-[#151E32] dark:text-slate-100 dark:ring-white/[0.06] ${accent}`}
    >
      {COPY[variant]}
    </span>
  );

  return (
    <span
      ref={wrapRef}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={handleBlur}
      className={`${fullWidth ? "flex w-full min-w-0" : "inline-flex"} ${className}`}
    >
      {children}
      {mounted && open ? createPortal(panel, document.body) : null}
    </span>
  );
}
