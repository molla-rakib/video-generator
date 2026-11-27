import type { Metadata } from "next";
import { PageContainer } from "@/components/layout/page-container";
import { CreateProjectForm } from "./create-form";

export const metadata: Metadata = { title: "New video" };

export default function NewProjectPage() {
  return (
    <PageContainer className="max-w-2xl">
      <div className="mb-8 space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">New video</h1>
        <p className="text-base text-muted-foreground">
          Add your voiceover and its subtitles. Claude turns them into an animated cartoon you can edit on the timeline.
        </p>
      </div>
      <CreateProjectForm />
    </PageContainer>
  );
}
