"use client";

import { useEffect } from "react";
import { RotateCcw } from "lucide-react";
import { PageContainer } from "@/components/layout/page-container";
import { Button } from "@/components/ui/button";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <PageContainer>
      <div className="mx-auto max-w-md py-16 text-center">
        <h1 className="text-xl font-semibold">Something went wrong</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This page couldn’t be shown. Your projects are safe — nothing has been lost.
        </p>
        <Button className="mt-6" onClick={reset}>
          <RotateCcw aria-hidden /> Try again
        </Button>
        {error.digest ? <p className="mt-6 text-xs text-muted-foreground">Reference: {error.digest}</p> : null}
      </div>
    </PageContainer>
  );
}
