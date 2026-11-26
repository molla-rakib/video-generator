import { z } from "zod";
import { createProject, enqueue, listProjects } from "@studio/database";
import { apiHandler, readJson } from "@/lib/server/api";

export const GET = apiHandler(async () => Response.json({ projects: await listProjects() }));

const CreateBody = z.object({
  project: z.record(z.string(), z.unknown()),
  /** Ask the Story Agent to write the first script right away. */
  writeScript: z.object({ targetMinutes: z.number().min(0.5).max(60) }).nullable().default(null),
});

export const POST = apiHandler(async (request: Request) => {
  const body = CreateBody.parse(await readJson(request));
  const project = await createProject(body.project as Parameters<typeof createProject>[0]);
  let job = null;
  if (body.writeScript && project.topic.trim()) {
    job = await enqueue("story.write", project.id, { topic: project.topic, targetMinutes: body.writeScript.targetMinutes });
  }
  return Response.json({ project, job }, { status: 201 });
});
