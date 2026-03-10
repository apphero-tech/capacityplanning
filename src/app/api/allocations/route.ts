import { NextResponse } from "next/server";
import { getInitialCapacities, insertInitialCapacity } from "@/lib/data";

export async function GET() {
  const entries = await getInitialCapacities();
  return NextResponse.json(entries);
}

export async function POST(request: Request) {
  const body = await request.json();
  const { lastName, firstName, role, location, ftPt, hrsPerWeek,
    refinement, design, development, qa, kt, lead, pmo, other } = body;

  if (!lastName || !firstName || !role || hrsPerWeek === undefined) {
    return NextResponse.json(
      { error: "lastName, firstName, role, and hrsPerWeek are required" },
      { status: 400 },
    );
  }

  const entry = insertInitialCapacity({
    lastName,
    firstName,
    role,
    location: location ?? "",
    ftPt: ftPt ?? "FT",
    hrsPerWeek: Number(hrsPerWeek),
    isActive: body.isActive !== false,
    refinement: Number(refinement ?? 0),
    design: Number(design ?? 0),
    development: Number(development ?? 0),
    qa: Number(qa ?? 0),
    kt: Number(kt ?? 0),
    lead: Number(lead ?? 0),
    pmo: Number(pmo ?? 0),
    other: Number(other ?? 0),
  });
  return NextResponse.json(entry, { status: 201 });
}
