import { describe, expect, it, vi } from "vitest";
import {
  CachedGoogleMapsDirections,
  type GoogleMapsDirectionsPort,
} from "./google-maps-directions";

describe("CachedGoogleMapsDirections", () => {
  it("does not cache failed lookups", async () => {
    const inner: GoogleMapsDirectionsPort = {
      getDurationInTrafficSeconds: vi
        .fn()
        .mockResolvedValueOnce({ ok: false, error: "x" })
        .mockResolvedValueOnce({ ok: true, durationSeconds: 3600 }),
    };
    const cached = new CachedGoogleMapsDirections(inner, 6);
    const a = await cached.getDurationInTrafficSeconds("o", "d");
    expect(a.ok).toBe(false);
    const b = await cached.getDurationInTrafficSeconds("o", "d");
    expect(b.ok).toBe(true);
    expect(inner.getDurationInTrafficSeconds).toHaveBeenCalledTimes(2);
  });
});
