import Link from "next/link";
import { Film } from "lucide-react";
import type { Project } from "@studio/database";
import { formatRelative } from "@/lib/format";
import { ProjectCardMenu } from "./project-card-menu";

export function ProjectCard({ project }: { project: Project }) {
  return (
    <article className="group relative flex flex-col overflow-hidden rounded-xl border bg-card transition-colors hover:border-foreground/25">
      <div className="relative flex aspect-video items-center justify-center overflow-hidden bg-surface">
        {project.thumbnailKey ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/api/projects/${project.id}/thumbnail?v=${encodeURIComponent(project.updatedAt)}`} alt="" className="size-full object-cover" />
        ) : (
          <Film className="size-6 text-muted-foreground/50" aria-hidden />
        )}
        <span className="absolute right-2 bottom-2 rounded bg-background/90 px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
          {project.aspectRatio}
        </span>
      </div>
      <div className="flex items-start justify-between gap-2 p-4">
        <div className="min-w-0 space-y-1">
          <h2 className="truncate text-base font-semibold">
            <Link href={`/projects/${project.id}`} className="after:absolute after:inset-0 focus-visible:outline-none">
              {project.title}
            </Link>
          </h2>
          <p className="truncate text-xs text-muted-foreground">
            {project.lastActivity || "Created"} · {formatRelative(project.updatedAt)}
          </p>
        </div>
        <ProjectCardMenu projectId={project.id} title={project.title} />
      </div>
    </article>
  );
}
