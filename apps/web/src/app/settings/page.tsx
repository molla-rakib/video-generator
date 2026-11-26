import type { Metadata } from "next";
import { PageContainer, PageHeader } from "@/components/layout/page-container";
import { SettingsForm } from "./settings-form";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <PageContainer className="max-w-3xl">
      <PageHeader
        title="Settings"
        description="Connect the AI brain and the voice, transcription and picture services. Keys are encrypted on this computer and never sent to the browser."
      />
      <SettingsForm />
    </PageContainer>
  );
}
