import Link from "next/link";
import { connection } from "next/server";
import { Clapperboard, Plus } from "lucide-react";
import { DatabaseUnavailableError, listProjects, type Project } from "@studio/database";
import { DatabaseUnavailable } from "@/components/database-unavailable";
import { PageContainer, PageHeader } from "@/components/layout/page-container";
import { ProjectCard } from "@/components/projects/project-card";
import { Button } from "@/components/ui/button";

export default async function ProjectsPage() {
  await connection();
  let projects: Project[];
  try {
    projects = await listProjects();
  } catch (error) {
    if (error instanceof DatabaseUnavailableError) return <DatabaseUnavailable />;
    throw error;
  }

  if (projects.length === 0) {
    return (
      <PageContainer>
        <div className="mx-auto flex max-w-xl flex-col items-center py-20 text-center">
          <span className="mb-6 flex size-14 items-center justify-center rounded-2xl bg-surface ring-1 ring-border">
            <Clapperboard className="size-6 text-muted-foreground" aria-hidden />
          </span>
          <h1 className="text-3xl font-semibold tracking-tight">আপনার প্রথম কার্টুন ভিডিও তৈরি করুন</h1>
          <p className="mt-3 text-base text-muted-foreground">
            Your cartoon arrives as editable pieces — scenes, music, sound effects and captions. Add your own clips, change any
            volume, remove what you don’t need, and export in every shape you publish to.
          </p>
          <Button asChild size="lg" className="mt-8">
            <Link href="/projects/new">
              <Plus aria-hidden /> New video
            </Link>
          </Button>
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <PageHeader
        title="Projects"
        description="Open a video to keep editing."
        actions={
          <Button asChild>
            <Link href="/projects/new">
              <Plus aria-hidden /> New video
            </Link>
          </Button>
        }
      />
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {projects.map((p) => (
          <ProjectCard key={p.id} project={p} />
        ))}
      </div>
    </PageContainer>
  );
}
