"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Clapperboard, FolderOpen, Images, Plus, Settings } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/", label: "Projects", icon: FolderOpen, match: (p: string) => p === "/" },
  { href: "/projects/new", label: "New video", icon: Plus, match: (p: string) => p === "/projects/new" },
  { href: "/media", label: "Media Library", icon: Images, match: (p: string) => p.startsWith("/media") },
  { href: "/settings", label: "Settings", icon: Settings, match: (p: string) => p.startsWith("/settings") || p.startsWith("/agents") },
];

/** Left navigation. Collapses to icons inside the editor to give the workspace room. */
export function Sidebar() {
  const pathname = usePathname();
  const compact = /^\/projects\/(?!new)[^/]+/.test(pathname);
  return (
    <aside className={cn("flex shrink-0 flex-col border-r bg-surface", compact ? "w-14" : "w-56")}>
      <Link href="/" className={cn("flex h-14 items-center gap-2 border-b font-semibold tracking-tight", compact ? "justify-center" : "px-4")}>
        <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-violet-500 to-orange-400 text-white shadow-sm">
          <Clapperboard className="size-4" aria-hidden />
        </span>
        {compact ? <span className="sr-only">Documentary Studio</span> : <span className="truncate">Documentary Studio</span>}
      </Link>
      <nav className="flex flex-1 flex-col gap-1 p-2">
        {NAV.map(({ href, label, icon: Icon, match }) => {
          const active = match(pathname);
          const link = (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex h-9 items-center gap-3 rounded-md text-sm transition-colors",
                compact ? "justify-center" : "px-3",
                active ? "bg-background font-medium text-foreground shadow-xs ring-1 ring-border" : "text-muted-foreground hover:bg-background hover:text-foreground",
              )}
            >
              <Icon className="size-4 shrink-0" aria-hidden />
              {compact ? <span className="sr-only">{label}</span> : label}
            </Link>
          );
          return compact ? (
            <Tooltip key={href}>
              <TooltipTrigger asChild>{link}</TooltipTrigger>
              <TooltipContent side="right">{label}</TooltipContent>
            </Tooltip>
          ) : (
            link
          );
        })}
      </nav>
    </aside>
  );
}
