import { NextResponse } from "next/server";
import { getPtoEntries, insertPtoEntry } from "@/lib/data";

export async function GET() {
  const entries = await getPtoEntries();
  return NextResponse.json(entries);
}

export async function POST(request: Request) {
  const body = await request.json();
  const { who, location, startDate, endDate, team } = body;

  if (!who || !location || !startDate || !endDate) {
    return NextResponse.json(
      { error: "who, location, startDate, and endDate are required" },
      { status: 400 }
    );
  }

  const entry = insertPtoEntry({ who, location, team: team ?? null, startDate, endDate });
  return NextResponse.json(entry, { status: 201 });
}
