import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import {
  DatabaseUnavailableError,
  getProject,
  getScript,
  getTimeline,
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
  if (!data) return <DatabaseUnavailable />;
  const [project, timeline, script, media, jobs] = data;
  return <Editor project={project} initialTimeline={timeline} initialScript={script} initialMedia={media} initialJobs={jobs} />;
}

async function load(projectId: string) {
  try {
    return await Promise.all([
      getProject(projectId),
      getTimeline(projectId),
      getScript(projectId),
      listMediaAssets({ projectId }),
      listRecentJobs(projectId),
    ]);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    if (error instanceof DatabaseUnavailableError) return null;
    throw error;
  }
}
