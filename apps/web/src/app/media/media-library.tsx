"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Download, FileAudio, Film, ImageIcon, Loader2, Pencil, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { MediaAsset } from "@studio/database";
import { formatClock } from "@studio/timeline";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api-client";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

type Item = MediaAsset & { projectTitle: string };
const KINDS = [
  { id: "", label: "All" },
  { id: "audio", label: "Audio" },
  { id: "image", label: "Pictures" },
  { id: "video", label: "Video" },
  { id: "render", label: "Rendered" },
];

export function MediaLibrary() {
  const [items, setItems] = useState<Item[] | null>(null);
  const [kind, setKind] = useState("");
  const [search, setSearch] = useState("");
  const [preview, setPreview] = useState<Item | null>(null);
  const [usage, setUsage] = useState<number | null>(null);
  const [confirm, setConfirm] = useState<Item | null>(null);

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (kind) params.set("kind", kind);
    if (search.trim()) params.set("search", search.trim());
    try {
      const { media } = await api<{ media: Item[] }>(`/api/media?${params}`);
      setItems(media);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't load media.");
      setItems([]);
    }
  }, [kind, search]);

  useEffect(() => {
    const t = setTimeout(() => void load(), 250);
    return () => clearTimeout(t);
  }, [load]);

  async function open(item: Item) {
    setPreview(item);
    setUsage(null);
    const { usedBy } = await api<{ usedBy: unknown[] }>(`/api/media/${item.id}`).catch(() => ({ usedBy: [] }));
    setUsage(usedBy.length);
  }

  async function rename(item: Item, name: string) {
    try {
      await api(`/api/media/${item.id}`, { method: "PATCH", json: { name } });
      setItems((list) => list?.map((m) => (m.id === item.id ? { ...m, name } : m)) ?? null);
      setPreview((p) => (p?.id === item.id ? { ...p, name } : p));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't rename.");
    }
  }

  async function remove(item: Item) {
    try {
      await api(`/api/media/${item.id}`, { method: "DELETE" });
      setItems((list) => list?.filter((m) => m.id !== item.id) ?? null);
      setPreview(null);
      toast.success("File deleted.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't delete.");
    } finally {
      setConfirm(null);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-xs">
          <Search className="absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name" className="pl-8" />
        </div>
        <div className="flex gap-1">
          {KINDS.map((k) => (
            <button
              key={k.id}
              onClick={() => setKind(k.id)}
              className={cn("rounded-md px-3 py-1.5 text-sm", kind === k.id ? "bg-secondary font-medium" : "text-muted-foreground hover:bg-accent")}
            >
              {k.label}
            </button>
          ))}
        </div>
      </div>

      {items === null ? (
        <div className="flex justify-center py-16">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : items.length === 0 ? (
        <p className="py-16 text-center text-sm text-muted-foreground">No media yet. Files you upload or generate inside a project appear here.</p>
      ) : (
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {items.map((m) => {
            const Icon = m.kind === "audio" ? FileAudio : m.kind === "image" ? ImageIcon : Film;
            return (
              <li key={m.id}>
                <button onClick={() => void open(m)} className="block w-full overflow-hidden rounded-lg border bg-card text-left hover:border-foreground/25">
                  <div className="relative flex aspect-video items-center justify-center bg-surface">
                    {m.thumbnailKey ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={`/api/media/${m.id}/thumb`} alt="" className="size-full object-cover" />
                    ) : (
                      <Icon className="size-6 text-muted-foreground" />
                    )}
                    {m.durationSeconds ? <span className="absolute right-1.5 bottom-1.5 rounded bg-background/90 px-1 text-[11px] tabular-nums">{formatClock(m.durationSeconds)}</span> : null}
                    {m.status !== "ready" ? (
                      <span className={cn("absolute top-1.5 left-1.5 rounded px-1.5 text-[11px]", m.status === "failed" ? "bg-destructive-soft text-destructive" : "bg-background/90")}>
                        {m.status === "failed" ? "Can’t use" : "Preparing"}
                      </span>
                    ) : null}
                  </div>
                  <div className="space-y-0.5 p-2">
                    <p className="truncate text-sm font-medium">{m.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {m.projectTitle} · {m.origin === "generated" ? `AI (${m.provider})` : m.origin}
                    </p>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <Dialog open={Boolean(preview)} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="sm:max-w-2xl">
          {preview ? (
            <>
              <DialogHeader>
                <DialogTitle className="sr-only">{preview.name}</DialogTitle>
                <input
                  key={preview.id}
                  defaultValue={preview.name}
                  onBlur={(e) => e.target.value.trim() && e.target.value !== preview.name && void rename(preview, e.target.value.trim())}
                  className="w-full rounded-md bg-transparent pr-6 text-lg font-semibold hover:bg-surface focus:bg-surface focus:outline-none"
                  aria-label="File name"
                />
              </DialogHeader>
              {preview.kind === "image" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={`/api/media/${preview.id}/file`} alt={preview.name} className="max-h-[55vh] w-full rounded-md object-contain" />
              ) : preview.kind === "audio" ? (
                <audio src={`/api/media/${preview.id}/file`} controls className="w-full" />
              ) : (
                <video src={`/api/media/${preview.id}/file`} controls className="max-h-[55vh] w-full rounded-md bg-black" />
              )}
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                <dt className="text-muted-foreground">Project</dt>
                <dd>
                  <Link href={`/projects/${preview.projectId}`} className="underline">
                    {preview.projectTitle}
                  </Link>
                </dd>
                <dt className="text-muted-foreground">Used on timeline</dt>
                <dd>{usage === null ? "…" : usage === 0 ? "Not used" : `${usage} time${usage === 1 ? "" : "s"}`}</dd>
                <dt className="text-muted-foreground">Added</dt>
                <dd>{formatDate(preview.createdAt)}</dd>
                <dt className="text-muted-foreground">Size</dt>
                <dd>{(preview.sizeBytes / 1024 / 1024).toFixed(1)} MB{preview.width ? ` · ${preview.width}×${preview.height}` : ""}</dd>
                {preview.prompt ? (
                  <>
                    <dt className="text-muted-foreground">Prompt</dt>
                    <dd className="line-clamp-4 font-[family-name:var(--font-bangla)]">{preview.prompt}</dd>
                  </>
                ) : null}
              </dl>
              <div className="flex gap-2">
                <Button asChild variant="outline">
                  <a href={`/api/media/${preview.id}/download`}>
                    <Download /> Download
                  </a>
                </Button>
                <Button variant="outline" onClick={() => document.querySelector<HTMLInputElement>('input[aria-label="File name"]')?.focus()}>
                  <Pencil /> Rename
                </Button>
                <Button variant="outline" className="ml-auto text-destructive" onClick={() => setConfirm(preview)}>
                  <Trash2 /> Delete
                </Button>
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(confirm)} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{confirm?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>The file is removed from disk. This can’t be undone. Files still used on a timeline can’t be deleted.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <Button variant="destructive" onClick={() => confirm && void remove(confirm)}>
              Delete file
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
