import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useDownloadStore } from "@/stores/download-store";

export function DownloadTypeTabs() {
  const { downloadType, setDownloadType } = useDownloadStore();

  return (
    <Tabs value={downloadType} onValueChange={(v) => setDownloadType(v as "VideoAudio" | "VideoOnly" | "AudioOnly")}>
      <TabsList className="w-full">
        <TabsTrigger value="VideoAudio" className="flex-1">Video + Audio</TabsTrigger>
        <TabsTrigger value="VideoOnly" className="flex-1">Video Only</TabsTrigger>
        <TabsTrigger value="AudioOnly" className="flex-1">Audio Only</TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
