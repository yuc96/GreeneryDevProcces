import { NextResponse } from "next/server";
import { listPots } from "@/server/catalog";

export function GET() {
  return NextResponse.json(listPots());
}
