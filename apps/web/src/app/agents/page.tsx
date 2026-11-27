import { redirect } from "next/navigation";

/** Connections now live on the Settings page. */
export default function AgentsPage() {
  redirect("/settings");
}
