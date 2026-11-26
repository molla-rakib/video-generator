import { DatabaseZap } from "lucide-react";
import { PageContainer } from "@/components/layout/page-container";

/** Shown when MongoDB can't be reached — explains how to fix it. */
export function DatabaseUnavailable() {
  return (
    <PageContainer>
      <div className="mx-auto max-w-lg rounded-xl border bg-surface p-8 text-center">
        <span className="mx-auto mb-4 flex size-11 items-center justify-center rounded-full bg-warning-soft text-warning">
          <DatabaseZap className="size-5" aria-hidden />
        </span>
        <h1 className="text-lg font-semibold">We can’t open your projects right now</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Documentary Studio keeps your projects in a local database that isn’t running. Start it, then reload this page.
        </p>
        <pre className="mt-5 rounded-md border bg-background px-4 py-3 text-left text-sm">npm run db:up</pre>
        <p className="mt-3 text-xs text-muted-foreground">Your projects are safe — nothing has been lost.</p>
      </div>
    </PageContainer>
  );
}
