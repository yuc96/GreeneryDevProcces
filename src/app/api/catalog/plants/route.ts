import { NextResponse } from "next/server";
import { listPlants } from "@/server/catalog";

export function GET() {
  return NextResponse.json(listPlants());
}
