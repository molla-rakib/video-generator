import type { Metadata } from "next";
import { PageContainer, PageHeader } from "@/components/layout/page-container";
import { MediaLibrary } from "./media-library";

export const metadata: Metadata = { title: "Media Library" };

export default function MediaPage() {
  return (
    <PageContainer className="max-w-7xl">
      <PageHeader title="Media Library" description="Every sound, picture, video and finished export across your projects." />
      <MediaLibrary />
    </PageContainer>
  );
}
