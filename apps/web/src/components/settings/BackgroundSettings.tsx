import { useState, type ChangeEvent } from "react";
import { ImageIcon, Trash2Icon } from "lucide-react";
import {
  MAX_CHAT_BACKGROUND_IMAGE_LENGTH,
  type ChatBackground,
  type ClientSettings,
} from "@t3tools/contracts/settings";

import { persistClientSettingsUpdate, useClientSettings } from "../../hooks/useSettings";
import { useStableCallback } from "../../hooks/useStableCallback";
import { Button } from "../ui/button";
import { toastManager } from "../ui/toast";
import { SettingsRow } from "./settingsLayout";
import { searchableSetting } from "./settingsSearch";

async function readBackgroundImage(file: File): Promise<string> {
  if (!["image/png", "image/jpeg", "image/webp", "image/avif"].includes(file.type)) {
    throw new Error("Choose a PNG, JPEG, WebP, or AVIF image.");
  }
  if (file.size > 20 * 1024 * 1024) throw new Error("Choose an image smaller than 20 MB.");
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 2560 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext("2d");
  if (context === null) {
    bitmap.close();
    throw new Error("This browser could not prepare the background image.");
  }
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const image = canvas.toDataURL("image/webp", 0.85);
  if (image.length > MAX_CHAT_BACKGROUND_IMAGE_LENGTH)
    throw new Error("This image is too detailed to save. Try a smaller image.");
  return image;
}

const reportBackgroundError = (error: unknown) =>
  toastManager.add({
    type: "error",
    title: "Background not saved",
    description: error instanceof Error ? error.message : "Could not save the background.",
  });

function BackgroundEditor({
  label,
  background,
  onChange,
  disabled = false,
}: {
  readonly label: string;
  readonly background: ChatBackground;
  readonly onChange: (patch: Partial<ChatBackground>) => void;
  readonly disabled?: boolean;
}) {
  const [uploading, setUploading] = useState(false);
  const [draftDimming, setDraftDimming] = useState<number | null>(null);
  const [draftBlur, setDraftBlur] = useState<number | null>(null);
  const dimming = draftDimming ?? background.dimming;
  const blur = draftBlur ?? background.blur;
  // Preview a drag locally; saving a large wallpaper on every pointer move queues disk writes.
  const commitDimming = (value: number) => {
    setDraftDimming(null);
    if (!disabled && value !== background.dimming) onChange({ dimming: value });
  };
  const commitBlur = (value: number) => {
    setDraftBlur(null);
    if (!disabled && value !== background.blur) onChange({ blur: value });
  };
  const upload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (file === undefined) return;
    setUploading(true);
    const image = await readBackgroundImage(file).catch((error: unknown) => {
      reportBackgroundError(error);
      return null;
    });
    setUploading(false);
    if (image !== null) onChange({ image });
  };
  return (
    <div className="space-y-3">
      <div className="relative h-24 overflow-hidden rounded-lg border border-border bg-muted">
        {background.image === null ? (
          <div className="flex h-full items-center justify-center gap-2 text-xs text-muted-foreground">
            <ImageIcon className="size-4" />
            Theme background
          </div>
        ) : (
          <>
            <img
              src={background.image}
              alt={`${label} background preview`}
              className="h-full w-full object-cover"
              style={{ filter: `blur(${blur}px)` }}
            />
            <div
              className="pointer-events-none absolute inset-0 bg-background"
              style={{ opacity: dimming / 100 }}
            />
          </>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative inline-flex rounded-md focus-within:outline-2 focus-within:outline-ring">
          <Button
            variant="outline"
            size="compact"
            disabled={disabled || uploading}
            render={<span />}
          >
            <ImageIcon />
            {uploading ? "Preparing image…" : "Choose image"}
          </Button>
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/avif"
            aria-label={`${label} background image`}
            disabled={disabled || uploading}
            onChange={upload}
            className="absolute inset-0 w-full cursor-pointer opacity-0 disabled:cursor-default"
          />
        </label>
        <Button
          variant="ghost"
          size="compact"
          disabled={disabled || uploading || background.image === null}
          onClick={() => onChange({ image: null })}
        >
          <Trash2Icon />
          Remove
        </Button>
      </div>
      <div className="grid gap-2">
        <label className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="w-14">Dimming</span>
          <input
            aria-label={`${label} background dimming`}
            type="range"
            min={0}
            max={90}
            step={5}
            value={dimming}
            disabled={disabled || uploading}
            onChange={(event) => setDraftDimming(Number(event.currentTarget.value))}
            onPointerUp={(event) => commitDimming(Number(event.currentTarget.value))}
            onKeyUp={(event) => commitDimming(Number(event.currentTarget.value))}
            onBlur={(event) => commitDimming(Number(event.currentTarget.value))}
            className="settings-slider min-w-0 flex-1"
          />
          <output className="w-9 text-right tabular-nums">{dimming}%</output>
        </label>
        <label className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="w-14">Blur</span>
          <input
            aria-label={`${label} background blur`}
            type="range"
            min={0}
            max={24}
            step={1}
            value={blur}
            disabled={disabled || uploading}
            onChange={(event) => setDraftBlur(Number(event.currentTarget.value))}
            onPointerUp={(event) => commitBlur(Number(event.currentTarget.value))}
            onKeyUp={(event) => commitBlur(Number(event.currentTarget.value))}
            onBlur={(event) => commitBlur(Number(event.currentTarget.value))}
            className="settings-slider min-w-0 flex-1"
          />
          <output className="w-9 text-right tabular-nums">{blur}px</output>
        </label>
      </div>
    </div>
  );
}

export function BackgroundSettings() {
  const background = useClientSettings((settings) => settings.chatBackground);
  const change = useStableCallback((patch: Partial<ChatBackground>) => {
    void persistClientSettingsUpdate((current: ClientSettings) => ({
      ...current,
      chatBackground: { ...current.chatBackground, ...patch },
      startBackground: null,
    })).catch(reportBackgroundError);
  });
  return (
    <div className="space-y-5">
      <SettingsRow
        {...searchableSetting("chat-background")}
        description="Start and conversations use your theme background. An optional image applies to both. Saved on this device."
      />
      <BackgroundEditor label="Background" background={background} onChange={change} />
    </div>
  );
}
