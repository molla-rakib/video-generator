"use client";

import { useRef, useState } from "react";
import { AlertCircle, FileAudio, Film, ImageIcon, Loader2, Plus, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import type { MediaAsset } from "@studio/database";
import { formatClock } from "@studio/timeline";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { mediaUrl, useEditorContext } from "../context";
import { placeAsset } from "../place-asset";
import { ASSET_DRAG_TYPE } from "../timeline/timeline";

const FILTERS = [
  { id: "all", label: "All" },
  { id: "video", label: "Video" },
  { id: "image", label: "Pictures" },
  { id: "audio", label: "Sound" },
] as const;

const ROLE_LABELS: Record<string, string> = {
  voice: "Voice",
  music: "Music",
  sfx: "SFX",
  ambience: "Ambience",
};

export function MediaPanel() {
  const { media, upload, refreshMedia } = useEditorContext();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["id"]>("all");
  const [dragOver, setDragOver] = useState(false);
  const [preview, setPreview] = useState<MediaAsset | null>(null);
  const [role, setRole] = useState<string>("");
  const fileRef = useRef<HTMLInputElement>(null);
  const items = media.filter((m) => m.kind !== "render" && (filter === "all" || m.kind === filter));

  return (
    <div
      className={cn("flex min-h-full flex-col gap-3 p-3", dragOver && "bg-brand-soft/50")}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("Files")) {
          e.preventDefault();
          setDragOver(true);
        }
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        if (!e.dataTransfer.files.length) return;
        e.preventDefault();
        setDragOver(false);
        void upload([...e.dataTransfer.files], role ? { role } : {});
      }}
    >
      <div className="rounded-lg border border-dashed p-3 text-center">
        <p className="text-sm text-muted-foreground">Drop your own video (like a face-cam clip), pictures, music or sound effects here</p>
        <div className="mt-2 flex items-center justify-center gap-2">
          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="h-8 rounded-md border bg-background px-2 text-xs"
            aria-label="What is this sound?"
          >
            <option value="">Sound type: auto</option>
            <option value="music">Music</option>
            <option value="sfx">Sound effect</option>
            <option value="ambience">Ambience</option>
            <option value="voice">Voice</option>
          </select>
          <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()}>
            <Upload /> Upload
          </Button>
        </div>
        <input
          ref={fileRef}
          type="file"
          multiple
          hidden
          accept="audio/*,image/png,image/jpeg,image/webp,image/gif,video/*"
          onChange={(e) => {
            const files = [...(e.target.files ?? [])];
            e.target.value = "";
            if (files.length) void upload(files, role ? { role } : {});
          }}
        />
      </div>

      <div className="flex gap-1">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={cn("rounded-md px-2.5 py-1 text-xs", filter === f.id ? "bg-secondary font-medium" : "text-muted-foreground hover:bg-accent")}
          >
            {f.label}
          </button>
        ))}
      </div>

      {items.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">No files yet. Generated music and sound effects also appear here.</p>
      ) : (
        <ul className="grid grid-cols-2 gap-2">
          {items.map((a) => (
            <MediaTile key={a.id} asset={a} onPreview={() => setPreview(a)} onDeleted={refreshMedia} />
          ))}
        </ul>
      )}
      <p className="text-[11px] text-muted-foreground">Drag a file onto a timeline track, or use + to add it at the playhead.</p>

      <Dialog open={Boolean(preview)} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="truncate pr-6">{preview?.name}</DialogTitle>
          </DialogHeader>
          {preview?.kind === "image" ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={mediaUrl(preview.id)} alt={preview.name} className="max-h-[60vh] w-full rounded-md object-contain" />
          ) : preview?.kind === "video" ? (
            <video src={mediaUrl(preview.id)} controls autoPlay className="max-h-[60vh] w-full rounded-md bg-black" />
          ) : preview ? (
            <audio src={mediaUrl(preview.id)} controls autoPlay className="w-full" />
          ) : null}
          {preview?.prompt ? <p className="font-[family-name:var(--font-bangla)] text-sm text-muted-foreground">{preview.prompt}</p> : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MediaTile({ asset, onPreview, onDeleted }: { asset: MediaAsset; onPreview: () => void; onDeleted: () => Promise<void> }) {
  const { store, playhead } = useEditorContext();
  const Icon = asset.kind === "audio" ? FileAudio : asset.kind === "video" ? Film : ImageIcon;
  const ready = asset.status === "ready";

  function addAtPlayhead() {
    store.apply((t) => placeAsset(t, asset, playhead.time));
  }

  async function remove() {
    try {
      await api(`/api/media/${asset.id}`, { method: "DELETE" });
      await onDeleted();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't delete this file.");
    }
  }

  return (
    <li
      className="group relative overflow-hidden rounded-md border bg-card"
      draggable={ready}
      onDragStart={(e) => {
        e.dataTransfer.setData(ASSET_DRAG_TYPE, asset.id);
        e.dataTransfer.effectAllowed = "copy";
      }}
    >
      <button className="block w-full text-left" onClick={onPreview} disabled={!ready}>
        <div className="relative flex aspect-video items-center justify-center bg-surface">
          {ready && asset.thumbnailKey ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={mediaUrl(asset.id, "thumb")} alt="" className="size-full object-cover" draggable={false} />
          ) : (
            <Icon className="size-5 text-muted-foreground" />
          )}
          {asset.status === "processing" ? (
            <span className="absolute inset-0 flex items-center justify-center gap-1 bg-background/70 text-xs">
              <Loader2 className="size-3.5 animate-spin" /> Preparing
            </span>
          ) : null}
          {asset.status === "failed" ? (
            <span className="absolute inset-0 flex items-center justify-center gap-1 bg-destructive-soft p-1 text-center text-[11px] text-destructive" title={asset.error ?? ""}>
              <AlertCircle className="size-3.5 shrink-0" /> Can’t use
            </span>
          ) : null}
          {asset.durationSeconds ? (
            <span className="absolute right-1 bottom-1 rounded bg-background/90 px-1 text-[10px] tabular-nums">{formatClock(asset.durationSeconds)}</span>
          ) : null}
          {asset.role && ROLE_LABELS[asset.role] ? (
            <span className="absolute top-1 left-1 rounded bg-background/90 px-1 text-[10px]">{ROLE_LABELS[asset.role]}</span>
          ) : null}
        </div>
        <p className="truncate px-1.5 py-1 text-[11px]" title={asset.name}>
          {asset.name}
        </p>
      </button>
      <div className="absolute top-1 right-1 flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
        <button className="rounded bg-background/95 p-1 shadow-xs hover:bg-accent disabled:opacity-40" onClick={addAtPlayhead} disabled={!ready} aria-label="Add at playhead">
          <Plus className="size-3.5" />
        </button>
        <button className="rounded bg-background/95 p-1 shadow-xs hover:bg-destructive-soft" onClick={() => void remove()} aria-label="Delete file">
          <Trash2 className="size-3.5" />
        </button>
      </div>
    </li>
  );
}
