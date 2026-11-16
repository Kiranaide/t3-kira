import { refreshBrowserSurfacePositions } from "~/browser/BrowserSurfaceSlot";
import { GAMES, useGameWindow, type Game } from "./quickGameWindowStore";
import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import {
  AuthPreviewOperateScope,
  type EnvironmentId,
  type ScopedThreadRef,
  ThreadId,
} from "@t3tools/contracts";
import {
  Gamepad2Icon,
  PanelRightIcon,
  PictureInPicture2Icon,
  XIcon,
  GripHorizontalIcon,
} from "lucide-react";
import { lazy, Suspense, useEffect, useState, useRef } from "react";

import { usePreviewAvailable } from "~/browser/previewRuntime";
import { useStableCallback } from "~/hooks/useStableCallback";
import { randomUUID } from "~/lib/utils";
import { clearThreadPreviewState } from "~/previewStateStore";
import { previewEnvironment } from "~/state/preview";
import { useEnvironmentScope } from "~/state/session";
import { useAtomCommand } from "~/state/use-atom-command";
import { openPreviewSession } from "../preview/openPreviewSession";
import { Button } from "../ui/button";

const PreviewView = lazy(() =>
  import("../preview/PreviewView").then((module) => ({ default: module.PreviewView })),
);

function GamePreview({ environmentId, game }: { environmentId: EnvironmentId; game: Game }) {
  const [preview, setPreview] = useState<{ threadRef: ScopedThreadRef } | { error: string } | null>(
    null,
  );
  const openPreview = useStableCallback(
    useAtomCommand(previewEnvironment.open, { reportFailure: false }),
  );
  const closePreview = useStableCallback(useAtomCommand(previewEnvironment.close));

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- owns the browser session and releases it even if navigation finishes after unmount
  useEffect(() => {
    let disposed = false;
    // Preview scopes do not require a persisted agent thread.
    const threadRef = scopeThreadRef(environmentId, ThreadId.make(`quick-action-${randomUUID()}`));
    const opening = openPreviewSession({
      openPreview,
      threadRef,
      url: game.url,
      viewport: { _tag: "fill" },
    });
    void opening.then((result) => {
      if (disposed) return;
      if (result._tag === "Success") setPreview({ threadRef });
      else if (!isAtomCommandInterrupted(result)) {
        const cause = squashAtomCommandFailure(result);
        setPreview({ error: cause instanceof Error ? cause.message : "Could not open the game." });
      }
    });
    return () => {
      disposed = true;
      void opening
        .then(() => closePreview({ environmentId, input: { threadId: threadRef.threadId } }))
        .then((result) => {
          if (result._tag === "Success") clearThreadPreviewState(threadRef);
        });
    };
  }, [environmentId, game.url, openPreview, closePreview]);

  if (preview === null)
    return (
      <p role="status" className="p-6">
        Opening game…
      </p>
    );
  return "threadRef" in preview ? (
    <Suspense fallback={<p role="status">Opening game…</p>}>
      <PreviewView threadRef={preview.threadRef} visible surfaceZIndex={45} />
    </Suspense>
  ) : (
    <p role="alert" className="p-6 text-sm text-warning">
      {preview.error}
    </p>
  );
}

export function GameWindowHost() {
  const { game, environmentId, docked } = useGameWindow();
  const windowRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  if (!game || !environmentId) return null;
  const panel = (
    <div
      ref={windowRef}
      role="region"
      aria-label={`${game.label} game window`}
      className={docked ? "game-window game-window-docked" : "game-window game-window-floating"}
    >
      <header className="game-window-header">
        <div
          className="flex min-w-0 flex-1 touch-none items-center gap-2 self-stretch cursor-grab active:cursor-grabbing"
          onPointerDown={(event) => {
            if (docked || event.button !== 0) return;
            const rect = windowRef.current!.getBoundingClientRect();
            drag.current = { x: event.clientX, y: event.clientY, left: rect.left, top: rect.top };
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            const start = drag.current;
            const element = windowRef.current;
            if (!start || !element) return;
            element.style.left = `${Math.max(0, Math.min(window.innerWidth - element.offsetWidth, start.left + event.clientX - start.x))}px`;
            element.style.top = `${Math.max(40, Math.min(window.innerHeight - 80, start.top + event.clientY - start.y))}px`;
            element.style.right = "auto";
            element.style.bottom = "auto";
            refreshBrowserSurfacePositions(element);
          }}
          onPointerUp={() => {
            drag.current = null;
          }}
          onLostPointerCapture={() => {
            drag.current = null;
          }}
        >
          <GripHorizontalIcon aria-hidden className="size-4 text-muted-foreground" />
          <game.icon aria-hidden className="size-4 text-primary" />
          <span className="truncate text-sm font-medium">{game.label}</span>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={docked ? "Float game" : "Dock game beside chat"}
          onClick={() => {
            if (windowRef.current) windowRef.current.removeAttribute("style");
            useGameWindow.setState({ docked: !docked });
          }}
        >
          {docked ? <PictureInPicture2Icon /> : <PanelRightIcon />}
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Close game"
          onClick={() => useGameWindow.setState({ game: null })}
        >
          <XIcon />
        </Button>
      </header>
      <div className="flex min-h-0 flex-1 overflow-hidden" data-preview-panel-mode="embedded">
        <GamePreview
          key={`${environmentId}:${game.url}`}
          environmentId={environmentId}
          game={game}
        />
      </div>
    </div>
  );
  return panel;
}

export function QuickActionsPanel({ environmentId }: { environmentId: EnvironmentId | null }) {
  const available = usePreviewAvailable(environmentId);
  const canOperate = useEnvironmentScope(environmentId, AuthPreviewOperateScope);
  return (
    <section aria-label="Quick actions" className="pt-4">
      <div className="flex items-center gap-2 pb-3">
        <Gamepad2Icon className="size-4 text-primary" aria-hidden />
        <h2 className="text-xs font-medium text-foreground">Take a break</h2>
        <span className="text-2xs text-muted-foreground">Play alongside your agents</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {GAMES.map((entry) => (
          <button
            key={entry.url}
            type="button"
            className="quick-game-action"
            disabled={environmentId === null || !available || !canOperate}
            onClick={() => useGameWindow.setState({ game: entry, environmentId })}
          >
            <span className="quick-game-icon">
              <entry.icon aria-hidden className="size-5" />
            </span>
            <span className="flex flex-col items-start gap-0.5">
              <span className="text-sm font-medium">{entry.label}</span>
              <span className="text-2xs text-muted-foreground">
                {entry.label === "Wordle" ? "Daily word puzzle" : "Hit the streets"}
              </span>
            </span>
          </button>
        ))}
      </div>
      {!available || !canOperate ? (
        <p className="pt-2 text-2xs text-muted-foreground">
          {available ? "Preview access is required to play." : "Enable Browser to play inside T3."}
        </p>
      ) : null}
    </section>
  );
}
