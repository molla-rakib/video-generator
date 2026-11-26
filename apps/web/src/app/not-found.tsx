import Link from "next/link";
import { PageContainer } from "@/components/layout/page-container";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <PageContainer>
      <div className="mx-auto max-w-md py-16 text-center">
        <h1 className="text-xl font-semibold">We couldn’t find that</h1>
        <p className="mt-2 text-sm text-muted-foreground">It may have been deleted, or the link is incorrect.</p>
        <Button asChild className="mt-6">
          <Link href="/">Back to your projects</Link>
        </Button>
      </div>
    </PageContainer>
  );
}
