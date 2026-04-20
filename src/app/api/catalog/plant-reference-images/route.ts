import { NextResponse } from "next/server";
import plantReference from "@/data/plant-reference-images.json";

export function GET() {
  return NextResponse.json(plantReference);
}
