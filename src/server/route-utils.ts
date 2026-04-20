import { NextResponse } from "next/server";
import { HttpError } from "./http-error";

export function handleRouteError(e: unknown): NextResponse {
  if (e instanceof HttpError) {
    return NextResponse.json(
      { statusCode: e.status, message: e.message },
      { status: e.status },
    );
  }
  console.error(e);
  return NextResponse.json(
    { statusCode: 500, message: "Internal Server Error" },
    { status: 500 },
  );
}
