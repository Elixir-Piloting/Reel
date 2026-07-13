import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useDownloadStore } from "@/stores/download-store";

export function PremiereToggle() {
  const { premiereMode, setPremiereMode } = useDownloadStore();

  return (
    <div className="flex items-center gap-2">
      <Switch
        id="premiere-mode"
        checked={premiereMode}
        onCheckedChange={setPremiereMode}
      />
      <Label htmlFor="premiere-mode" className="text-sm cursor-pointer">
        Premiere Compatible
      </Label>
    </div>
  );
}
