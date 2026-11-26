import type { Metadata } from "next";
import { PageContainer, PageHeader } from "@/components/layout/page-container";
import { MediaLibrary } from "./media-library";

export const metadata: Metadata = { title: "Media Library" };

export default function MediaPage() {
  return (
    <PageContainer className="max-w-7xl">
      <PageHeader title="Media Library" description="Every narration, picture, video and finished render across your documentaries." />
      <MediaLibrary />
    </PageContainer>
  );
}
