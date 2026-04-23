import { NextResponse } from "next/server";
import {
  createProposal,
  listProposalSummaries,
} from "@/server/proposals-store";
import { handleRouteError } from "@/server/route-utils";
import { parseCreateProposal } from "@/server/validate-proposal";

export async function GET() {
  try {
    const rows = await listProposalSummaries();
    return NextResponse.json({ proposals: rows });
  } catch (e) {
    return handleRouteError(e);
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const dto = parseCreateProposal(body);
    const created = await createProposal(dto);
    return NextResponse.json(created);
  } catch (e) {
    return handleRouteError(e);
  }
}
