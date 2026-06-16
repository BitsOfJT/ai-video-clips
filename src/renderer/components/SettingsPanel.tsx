import { useEffect, useState } from "react";
import { Check, KeyRound } from "lucide-react";
import { Button } from "@/renderer/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/renderer/components/ui/card";
import { Input } from "@/renderer/components/ui/input";
import { Label } from "@/renderer/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/renderer/components/ui/select";
import { useAppStore } from "@/renderer/store/useAppStore";
import type { AIProvider, UpdateSettingsInput } from "@/types/electron";

/**
 * Minimal settings panel (pulled forward from Phase 6) for choosing the AI
 * provider and supplying credentials. The Gemini API key is write-only — it is
 * encrypted in the main process and never read back into the renderer.
 */
export default function SettingsPanel() {
  const settings = useAppStore((state) => state.settings);
  const loadSettings = useAppStore((state) => state.loadSettings);
  const saveSettings = useAppStore((state) => state.saveSettings);

  const [provider, setProvider] = useState<AIProvider>("ollama");
  const [geminiApiKey, setGeminiApiKey] = useState("");
  const [ollamaBaseUrl, setOllamaBaseUrl] = useState("");
  const [ollamaTextModel, setOllamaTextModel] = useState("");
  const [ollamaVisionModel, setOllamaVisionModel] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  // Seed editable fields when settings first load (or change). Adjusting state
  // during render on an identity change is the React-recommended pattern and
  // avoids a setState-in-effect cascade. The API key stays blank (write-only).
  const [seededFrom, setSeededFrom] = useState<typeof settings>(null);
  if (settings && settings !== seededFrom) {
    setSeededFrom(settings);
    setProvider(settings.provider);
    setOllamaBaseUrl(settings.ollamaBaseUrl);
    setOllamaTextModel(settings.ollamaTextModel);
    setOllamaVisionModel(settings.ollamaVisionModel);
  }

  const handleSave = async () => {
    const input: UpdateSettingsInput = { provider, ollamaBaseUrl, ollamaTextModel, ollamaVisionModel };
    // Only send the key when the user typed one, so we never clear it accidentally.
    if (geminiApiKey.trim() !== "") input.geminiApiKey = geminiApiKey.trim();
    await saveSettings(input);
    setGeminiApiKey("");
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>AI Provider</CardTitle>
        <CardDescription>
          Choose a free AI backend. Gemini uses a free API key (cloud); Ollama runs fully local and
          offline.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2">
          <Label>Provider</Label>
          <Select value={provider} onValueChange={(v) => setProvider(v as AIProvider)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ollama">Ollama — local & offline (free)</SelectItem>
              <SelectItem value="gemini">Google Gemini — free tier (API key)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {provider === "gemini" ? (
          <div className="space-y-2">
            <Label htmlFor="gemini-key" className="flex items-center gap-1">
              <KeyRound className="h-3.5 w-3.5" />
              Gemini API key
            </Label>
            <Input
              id="gemini-key"
              type="password"
              autoComplete="off"
              value={geminiApiKey}
              onChange={(e) => setGeminiApiKey(e.target.value)}
              placeholder={settings?.hasGeminiKey ? "•••••••• (saved — type to replace)" : "Paste your free Google AI Studio key"}
            />
            <p className="text-xs text-muted-foreground">
              Stored encrypted on this device via the OS keychain. Get a free key at ai.google.dev.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="ollama-url">Ollama URL</Label>
              <Input
                id="ollama-url"
                value={ollamaBaseUrl}
                onChange={(e) => setOllamaBaseUrl(e.target.value)}
                placeholder="http://localhost:11434"
              />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="ollama-text">Text model</Label>
                <Input
                  id="ollama-text"
                  value={ollamaTextModel}
                  onChange={(e) => setOllamaTextModel(e.target.value)}
                  placeholder="llama3.1"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ollama-vision">Vision model</Label>
                <Input
                  id="ollama-vision"
                  value={ollamaVisionModel}
                  onChange={(e) => setOllamaVisionModel(e.target.value)}
                  placeholder="llama3.2-vision"
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Pull models first, e.g. <code>ollama pull llama3.2-vision</code>.
            </p>
          </div>
        )}

        <Button onClick={handleSave} className="w-full">
          {saved ? (
            <>
              <Check className="mr-1 h-4 w-4" /> Saved
            </>
          ) : (
            "Save Settings"
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
