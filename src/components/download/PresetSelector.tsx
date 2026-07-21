import { useState } from "react";
import { Plus, X } from "lucide-react";
import { useDownloadStore } from "@/stores/download-store";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function PresetSelector() {
  const { presets, selectedPresetId, selectPreset, addPreset, removePreset } = useDownloadStore();
  const [showSave, setShowSave] = useState(false);
  const [presetName, setPresetName] = useState("");

  const handleSave = () => {
    if (presetName.trim()) {
      addPreset(presetName.trim());
      setPresetName("");
      setShowSave(false);
    }
  };

  return (
    <div className="space-y-1.5">
      <Label className="text-sm text-muted-foreground">Preset</Label>
      <div className="flex gap-2">
        <div className="flex-1">
          <Select
            value={selectedPresetId || ""}
            onValueChange={(v) => selectPreset(v === "__none__" || !v ? null : v)}
          >
            <SelectTrigger>
              <SelectValue placeholder="None" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">None</SelectItem>
              {presets.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button
          variant="outline"
          size="icon"
          className="shrink-0"
          onClick={() => setShowSave(!showSave)}
          title="Save current settings as preset"
        >
          <Plus className="h-4 w-4" />
        </Button>
        {selectedPresetId && (
          <Button
            variant="outline"
            size="icon"
            className="shrink-0 text-destructive"
            onClick={() => removePreset(selectedPresetId)}
            title="Delete preset"
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
      {showSave && (
        <div className="flex gap-2 items-center pt-1">
          <Input
            placeholder="Preset name..."
            value={presetName}
            onChange={(e) => setPresetName(e.target.value)}
            className="h-8 text-sm flex-1"
            onKeyDown={(e) => e.key === "Enter" && handleSave()}
            autoFocus
          />
          <Button size="sm" onClick={handleSave} disabled={!presetName.trim()}>
            Save
          </Button>
        </div>
      )}
    </div>
  );
}
