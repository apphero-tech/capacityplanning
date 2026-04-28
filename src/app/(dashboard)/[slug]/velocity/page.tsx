import { redirect } from "next/navigation";

// Velocity was merged into the Plan page in the v2 simplification — the
// historical strip at the bottom of Plan carries the same information.
export default function VelocityPage() {
  redirect("/capacity");
}
