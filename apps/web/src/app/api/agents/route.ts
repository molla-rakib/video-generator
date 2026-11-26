import { agentStatuses } from "@studio/providers";
import { apiHandler } from "@/lib/server/api";

export const GET = apiHandler(async () => Response.json({ agents: await agentStatuses() }));
