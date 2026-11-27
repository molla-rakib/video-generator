import type { NextRequest } from "next/server";
import { getProject } from "@studio/database";
import { UserFacingError } from "@studio/shared";
import { apiHandler } from "@/lib/server/api";
import { applyInputs, inputStatus, saveSubtitles, saveVoice } from "@/lib/server/project-input";

type Context = RouteContext<"/api/projects/[projectId]/input">;

export const GET = apiHandler(async (_request: NextRequest, ctx: Context) => {
  const { projectId } = await ctx.params;
  return Response.json(await inputStatus(projectId));
});

/**
 * Upload the voiceover (?kind=voice) or the subtitle file (?kind=subtitles)
 * as the raw request body; ?apply=1 then lays both out on the timeline.
 */
export const POST = apiHandler(async (request: NextRequest, ctx: Context) => {
  const { projectId } = await ctx.params;
  await getProject(projectId);
  const params = request.nextUrl.searchParams;
  if (params.get("apply")) return Response.json(await applyInputs(projectId));

  const kind = params.get("kind");
  const name = params.get("name")?.slice(0, 200) ?? "";
  if (!request.body) throw new UserFacingError("The upload was empty.");
  if (kind === "voice") {
    const path = await saveVoice(projectId, name, request.body, Number(request.headers.get("content-length") ?? 0));
    return Response.json({ path }, { status: 201 });
  }
  if (kind === "subtitles") {
    const { path, parsed } = await saveSubtitles(projectId, name, await request.text());
    return Response.json({ path, cues: parsed.cues.length, emotionHints: parsed.emotionHints.length, warnings: parsed.warnings }, { status: 201 });
  }
  throw new UserFacingError("Unknown upload.");
});
