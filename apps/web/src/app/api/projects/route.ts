import { z } from "zod";
import { createProject, listProjects, registerProjectFiles, touchProject } from "@studio/database";
import { AspectRatioSchema } from "@studio/shared";
import { apiHandler, readJson } from "@/lib/server/api";
import { buildSampleProject } from "@/lib/server/sample-project";

export const GET = apiHandler(async () => Response.json({ projects: await listProjects() }));

const CreateBody = z.object({
  project: z.record(z.string(), z.unknown()),
  /** Fill the new project with the built-in sample (scenes, music, SFX, captions). */
  sample: z.boolean().default(false),
});

export const POST = apiHandler(async (request: Request) => {
  const body = CreateBody.parse(await readJson(request));
  if (!body.sample) {
    const project = await createProject(body.project as Parameters<typeof createProject>[0]);
    return Response.json({ project }, { status: 201 });
  }
  const ratio = AspectRatioSchema.catch("9:16").parse(body.project.aspectRatio);
  let mediaFiles: Array<{ path: string; role: string; name: string }> = [];
  const project = await createProject(body.project as Parameters<typeof createProject>[0], async (projectId) => {
    const built = await buildSampleProject(projectId, ratio);
    mediaFiles = built.mediaFiles;
    return built.timeline;
  });
  await registerProjectFiles(project.id, mediaFiles);
  await touchProject(project.id, "Sample project created");
  return Response.json({ project }, { status: 201 });
});
