import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { DatabaseUnavailableError } from "@studio/database";
import { agentStatuses, type AgentStatus } from "@studio/providers";
import { DatabaseUnavailable } from "@/components/database-unavailable";
import { PageContainer, PageHeader } from "@/components/layout/page-container";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "AI Agents" };

export default async function AgentsPage() {
  await connection();
  let agents: AgentStatus[];
  try {
    agents = await agentStatuses();
  } catch (error) {
    if (error instanceof DatabaseUnavailableError) return <DatabaseUnavailable />;
    throw error;
  }
  return (
    <PageContainer className="max-w-4xl">
      <PageHeader
        title="AI Agents"
        description="The specialists that work on your documentary, and which service each one uses."
        actions={
          <Button asChild variant="outline">
            <Link href="/settings">Connect services</Link>
          </Button>
        }
      />
      <ul className="divide-y rounded-xl border">
        {agents.map((a) => (
          <li key={a.id} className="flex items-start gap-4 p-4">
            {a.ready ? <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" /> : <AlertCircle className="mt-0.5 size-5 shrink-0 text-warning" />}
            <div className="min-w-0 flex-1 space-y-0.5">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <h2 className="font-medium">{a.name}</h2>
                <span className="text-sm text-muted-foreground">{a.engine === "Not connected" ? "not connected" : `uses ${a.engine}`}</span>
              </div>
              <p className="text-sm text-muted-foreground">{a.description}</p>
              {a.note ? <p className="text-sm text-warning">{a.note}</p> : null}
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-sm text-muted-foreground">
        Every agent reports real progress and real errors. If a service isn’t connected, you can still upload your own narration, pictures and video.
      </p>
    </PageContainer>
  );
}
