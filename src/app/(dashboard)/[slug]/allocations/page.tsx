import { redirect } from "next/navigation";

// Allocations merged into Team. Keep the route so bookmarks still work.
export default function AllocationsPage() {
  redirect("/team");
}
