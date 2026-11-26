import type { Metadata } from "next";
import { PageContainer } from "@/components/layout/page-container";
import { CreateDocumentaryForm } from "./create-form";

export const metadata: Metadata = { title: "Create Documentary" };

export default function NewProjectPage() {
  return (
    <PageContainer className="max-w-2xl">
      <div className="mb-8 space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Create a documentary</h1>
        <p className="text-base text-muted-foreground">
          Tell us the topic. The Story Agent can write the first Bangla script for you while the editor opens.
        </p>
      </div>
      <CreateDocumentaryForm />
    </PageContainer>
  );
}
