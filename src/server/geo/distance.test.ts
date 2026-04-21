import { describe, expect, it } from "vitest";
import {
  DRIVE_SPEED_KMH,
  isWithinServiceRadius,
  estimateDriveFromAddress,
  GREENERY_HQ_COORD,
  GREENERY_SERVICE_RADIUS_KM,
  minutesFromDistanceKm,
  distanceKm,
} from "./distance";

describe("distance geo utils", () => {
  it("converts km to minutes at 45 km/h", () => {
    expect(minutesFromDistanceKm(45, DRIVE_SPEED_KMH)).toBe(60);
    expect(minutesFromDistanceKm(22.5, DRIVE_SPEED_KMH)).toBe(30);
  });

  it("resolves central Florida zip and estimates drive", () => {
    const res = estimateDriveFromAddress("400 W Livingston St, Orlando, FL 32801");
    expect(res.distanceKm).toBeGreaterThan(0);
    expect(res.distanceKm).toBeLessThanOrEqual(GREENERY_SERVICE_RADIUS_KM);
    expect(res.driveMinutes).toBeGreaterThan(0);
  });

  it("rejects addresses outside configured radius", () => {
    expect(() =>
      estimateDriveFromAddress("1600 Amphitheatre Parkway, Mountain View, CA 94043"),
    ).toThrow(/outside service radius|resolve address coordinates/i);
  });

  it("distance is zero for same coordinate", () => {
    expect(distanceKm(GREENERY_HQ_COORD, GREENERY_HQ_COORD)).toBeCloseTo(0, 6);
  });

  it("accepts exactly 80km and rejects >80km", () => {
    expect(isWithinServiceRadius(80, GREENERY_SERVICE_RADIUS_KM)).toBe(true);
    expect(isWithinServiceRadius(80.01, GREENERY_SERVICE_RADIUS_KM)).toBe(false);
  });
});
