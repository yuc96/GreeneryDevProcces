"use client";

import { useEffect } from "react";

/**
 * When mounted on a page reached via `?autoprint=1`, automatically opens
 * the browser's print dialog once the DOM (and images) are ready.
 *
 * Intended to be used on the standalone `/proposal/[id]/client` route so
 * the wizard can delegate "Print / Save PDF" to a clean, chromeless view.
 */
export function AutoPrint() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("autoprint") !== "1") return;

    let cancelled = false;

    const trigger = () => {
      if (cancelled) return;
      try {
        window.focus();
        window.print();
      } catch {
        /* Ignore — user can still click the Print button manually. */
      }
    };

    // Wait for images (plant photos, logo…) to load before opening the
    // print dialog so the paginated preview is accurate.
    const waitForImages = async (): Promise<void> => {
      const imgs = Array.from(document.images);
      await Promise.all(
        imgs
          .filter((img) => !img.complete)
          .map(
            (img) =>
              new Promise<void>((resolve) => {
                img.addEventListener("load", () => resolve(), { once: true });
                img.addEventListener("error", () => resolve(), { once: true });
              }),
          ),
      );
    };

    const run = async () => {
      await waitForImages();
      // Small delay gives React/Next one more paint tick before print.
      setTimeout(trigger, 150);
    };

    if (document.readyState === "complete") {
      void run();
    } else {
      const onLoad = () => void run();
      window.addEventListener("load", onLoad, { once: true });
      return () => {
        cancelled = true;
        window.removeEventListener("load", onLoad);
      };
    }

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
