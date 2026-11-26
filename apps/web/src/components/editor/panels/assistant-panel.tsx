"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bot, CheckCircle2, Loader2, SendHorizonal, Trash2, XCircle } from "lucide-react";
import { toast } from "sonner";
import type { ChatMessage } from "@studio/database";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { isBusy, useEditorContext } from "../context";

const SUGGESTIONS = [
  "মুক্তিযুদ্ধ নিয়ে একটি ৩ মিনিটের ডকুমেন্টারি লেখো",
  "Make the narration more emotional",
  "Generate Bangla voiceover",
  "Generate subtitles",
  "Create visuals for every scene",
  "Make scene 2 three seconds longer",
];

/** The AI Production Assistant: chat that actually performs actions. */
export function AssistantPanel({ chatVersion }: { chatVersion: string }) {
  const { project, jobs, store } = useEditorContext();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const working = isBusy(jobs, "assistant.turn");

  useEffect(() => {
    let alive = true;
    api<{ messages: ChatMessage[] }>(`/api/projects/${project.id}/chat`)
      .then(({ messages }) => alive && setMessages(messages))
      .catch(() => {
        // retried on the next change notification
      });
    return () => {
      alive = false;
    };
  }, [project.id, chatVersion]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length, working]);

  async function send(value: string) {
    const body = value.trim();
    if (!body || sending || working) return;
    setSending(true);
    try {
      await store.save(); // the assistant should see the latest timeline
      const { message } = await api<{ message: ChatMessage }>(`/api/projects/${project.id}/chat`, { method: "POST", json: { text: body } });
      setMessages((m) => [...m, message]);
      setText("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The message couldn't be sent.");
    } finally {
      setSending(false);
    }
  }

  async function clear() {
    await api(`/api/projects/${project.id}/chat`, { method: "DELETE" }).catch(() => {});
    setMessages([]);
  }

  return (
    <aside className="flex w-[320px] shrink-0 flex-col border-l" aria-label="AI Production Assistant">
      <div className="flex h-11 items-center gap-2 border-b px-3">
        <Bot className="size-4 text-brand" />
        <span className="flex-1 text-sm font-medium">AI Assistant</span>
        {messages.length ? (
          <Button variant="ghost" size="icon-xs" onClick={() => void clear()} aria-label="Clear conversation">
            <Trash2 />
          </Button>
        ) : null}
      </div>
      <div ref={listRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        {messages.length === 0 && !working ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Ask in Bangla or English. The assistant can write and rewrite the script, generate the voice-over, subtitles and pictures, arrange the timeline and render.
            </p>
            <div className="flex flex-col gap-1.5">
              {SUGGESTIONS.map((s) => (
                <button key={s} onClick={() => void send(s)} className="rounded-md border px-2.5 py-1.5 text-left font-[family-name:var(--font-bangla)] text-xs hover:bg-surface">
                  {s}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground">
              Uses the AI brain from <Link href="/settings" className="underline">Settings</Link>.
            </p>
          </div>
        ) : null}
        {messages.map((m) => (
          <div key={m.id} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
            <div className={cn("max-w-[92%] space-y-1.5 rounded-lg px-3 py-2 text-sm", m.role === "user" ? "bg-primary text-primary-foreground" : "bg-surface")}>
              <p className="font-[family-name:var(--font-bangla)] leading-6 whitespace-pre-wrap">{m.text}</p>
              {m.actions.length ? (
                <ul className="space-y-1 border-t pt-1.5">
                  {m.actions.map((a, i) => (
                    <li key={i} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                      {a.ok ? <CheckCircle2 className="mt-0.5 size-3 shrink-0 text-success" /> : <XCircle className="mt-0.5 size-3 shrink-0 text-destructive" />}
                      <span className="line-clamp-2">{a.summary}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </div>
        ))}
        {working ? (
          <div className="flex items-center gap-2 rounded-lg bg-surface px-3 py-2 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" />
            {working.status === "pending" ? "Waiting for the background worker…" : working.progressMessage || "Thinking…"}
          </div>
        ) : null}
      </div>
      <form
        className="border-t p-2"
        onSubmit={(e) => {
          e.preventDefault();
          void send(text);
        }}
      >
        <div className="flex items-end gap-1.5 rounded-lg border bg-background p-1.5 focus-within:ring-2 focus-within:ring-ring/40">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send(text);
              }
            }}
            rows={2}
            placeholder="যা করতে চান লিখুন…"
            className="max-h-40 min-h-10 flex-1 resize-none bg-transparent px-1.5 py-1 font-[family-name:var(--font-bangla)] text-sm focus:outline-none"
            aria-label="Message the assistant"
          />
          <Button type="submit" size="icon-sm" disabled={!text.trim() || sending || Boolean(working)} aria-label="Send">
            {sending ? <Loader2 className="animate-spin" /> : <SendHorizonal />}
          </Button>
        </div>
      </form>
    </aside>
  );
}
