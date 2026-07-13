import { useEffect } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { UrlInput } from "@/components/download/UrlInput";
import { MetadataCard } from "@/components/download/MetadataCard";
import { DownloadButton } from "@/components/download/DownloadButton";
import { DownloadTypeTabs } from "@/components/download/DownloadTypeTabs";
import { FormatSelector } from "@/components/download/FormatSelector";
import { PremiereToggle } from "@/components/download/PremiereToggle";
import { AdvancedSection } from "@/components/download/AdvancedSection";
import { DownloadQueue } from "@/components/queue/DownloadQueue";
import { useSettingsStore } from "@/stores/settings-store";

export default function App() {
  const { loadSettings } = useSettingsStore();

  useEffect(() => {
    loadSettings();
  }, []);

  return (
    <AppShell>
      <div className="space-y-4">
        <UrlInput />
        <MetadataCard />
        <DownloadButton />
        <DownloadTypeTabs />
        <FormatSelector />
        <PremiereToggle />
        <AdvancedSection />
        <DownloadQueue />
      </div>
    </AppShell>
  );
}
