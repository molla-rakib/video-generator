import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import {
  DatabaseUnavailableError,
  getProject,
  getTimeline,
  InvalidProjectFileError,
  listMediaAssets,
  listRecentJobs,
} from "@studio/database";
import { NotFoundError } from "@studio/shared";
import { DatabaseUnavailable } from "@/components/database-unavailable";
import { Editor } from "@/components/editor/editor";

export async function generateMetadata({ params }: PageProps<"/projects/[projectId]">): Promise<Metadata> {
  const { projectId } = await params;
  try {
    return { title: (await getProject(projectId)).title };
  } catch {
    return { title: "Editor" };
  }
}

export default async function EditorPage({ params }: PageProps<"/projects/[projectId]">) {
  await connection();
  const { projectId } = await params;
  const data = await load(projectId);
  if (data === "db") return <DatabaseUnavailable />;
  if (typeof data === "string") return <ProjectFileProblem message={data} />;
  const [project, timeline, media, jobs] = data;
  return <Editor project={project} initialTimeline={timeline} initialMedia={media} initialJobs={jobs} />;
}

async function load(projectId: string) {
  try {
    return await Promise.all([getProject(projectId), getTimeline(projectId), listMediaAssets({ projectId }), listRecentJobs(projectId)]);
  } catch (error) {
    if (error instanceof InvalidProjectFileError) return error.message;
    if (error instanceof NotFoundError) notFound();
    if (error instanceof DatabaseUnavailableError) return "db" as const;
    throw error;
  }
}

function ProjectFileProblem({ message }: { message: string }) {
  return (
    <div className="mx-auto max-w-xl space-y-3 p-10">
      <h1 className="text-xl font-semibold">This project can’t be opened</h1>
      <p className="text-sm text-muted-foreground">{message}</p>
      <p className="text-sm text-muted-foreground">
        Fix <code>project.json</code> in the project folder (or restore a copy from its <code>history/</code> folder) and reload this page.
      </p>
    </div>
  );
}
