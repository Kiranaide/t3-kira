import { useDockedGame } from "./start/quickGameWindowStore";
import { KeepAwakeControl } from "./KeepAwakeControl";
import { scopeThreadRef, scopedThreadKey } from "@t3tools/client-runtime/environment";
import { threadRuntimeIsActive } from "@t3tools/client-runtime/state/shell";
import type { ScopedThreadRef, ThreadId } from "@t3tools/contracts";
import {
  Columns2Icon,
  LayoutGridIcon,
  Maximize2Icon,
  Minimize2Icon,
  Rows2Icon,
  XIcon,
} from "lucide-react";
import { use, useEffect, useRef, type CSSProperties, type ReactNode, type RefObject } from "react";

import {
  agentGridDimensions,
  agentTrackSizes,
  defaultAgentWorkspace,
  resizeAgentTracks,
  useAgentWorkspaceStore,
  type AgentLayout,
} from "../agentWorkspaceStore";
import { ComposerHandleContext } from "../composerHandleContext";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { cn } from "../lib/utils";
import { useQuietThreadShell } from "../state/entities";
import { appAtomRegistry } from "../rpc/atomRegistry";
import { threadFamilies } from "../state/threads";
import ChatView from "./ChatView";
import { AgentWorkspaceContext, AgentWindowVisibleContext } from "./chat/agentWorkspaceContext";
import { BackgroundThreadContext } from "./chat/backgroundThread";
import { SplitChatControl } from "./chat/SplitChatControl";
import { Button } from "./ui/button";
import { ToggleGroup, ToggleGroupItem } from "./ui/toggle-group";
import { Tooltip, TooltipPopup, TooltipTrigger } from "./ui/tooltip";
import { COLLAPSED_SIDEBAR_TITLEBAR_INSET_CLASS } from "../workspaceTitlebar";

const AGENT_LAYOUT_OPTIONS = [
  { value: "grid", label: "Grid layout", Icon: LayoutGridIcon },
  { value: "columns", label: "Column layout", Icon: Columns2Icon },
  { value: "rows", label: "Row layout", Icon: Rows2Icon },
] as const;

function AgentWindowTab({
  threadRef,
  active,
  onSelect,
}: {
  threadRef: ScopedThreadRef;
  active: boolean;
  onSelect: () => void;
}) {
  const shell = useQuietThreadShell(threadRef);
  const running = threadRuntimeIsActive(shell?.runtime);
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      className={cn(
        "inline-flex min-w-0 shrink-0 items-center gap-2 rounded-md px-2.5 py-1.5 text-xs outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
        active && "bg-accent text-accent-foreground",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "size-1.5 shrink-0 rounded-full",
          running ? "bg-success-foreground" : "bg-muted-foreground",
        )}
      />
      <span className="max-w-32 truncate">{shell?.title || "Untitled thread"}</span>
      <span className="sr-only">{running ? "Running" : "Idle"}</span>
    </button>
  );
}

function AgentWindow({
  owner,
  threadId,
  active,
  focused,
  hidden,
  tiled,
  children,
}: {
  owner: ScopedThreadRef;
  threadId: ThreadId;
  active: boolean;
  focused: boolean;
  hidden: boolean;
  tiled: boolean;
  children?: ReactNode;
}) {
  const threadRef = scopeThreadRef(owner.environmentId, threadId);
  const shell = useQuietThreadShell(threadRef);
  const primary = threadId === owner.threadId;
  const background = use(BackgroundThreadContext);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- holds saved secondary threads in the shell even after they leave its bounded recent list
  useEffect(
    () =>
      primary ? undefined : threadFamilies.mount(appAtomRegistry, owner.environmentId, threadId),
    [owner.environmentId, primary, threadId],
  );
  const label = shell?.title || "Untitled thread";
  return (
    <AgentWindowVisibleContext value={!hidden && !background}>
      <BackgroundThreadContext value={background || hidden || !active}>
        <section
          aria-label={`Agent window: ${label}`}
          aria-hidden={hidden}
          inert={hidden}
          data-agent-window={threadId}
          data-active={active}
          className={cn(
            "relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background",
            tiled && "rounded-lg ring-1 ring-border",
            tiled && active && "ring-2 ring-primary/65",
            hidden && "hidden",
          )}
          onPointerDownCapture={() => {
            if (tiled && !active) useAgentWorkspaceStore.getState().activate(owner, threadId);
          }}
          onFocusCapture={() => {
            if (tiled && !active) useAgentWorkspaceStore.getState().activate(owner, threadId);
          }}
        >
          {primary ? null : (
            <header className="flex h-10 shrink-0 items-center gap-2 border-b border-border bg-muted/40 px-3">
              <span className="min-w-0 flex-1 truncate text-xs font-medium text-muted-foreground">
                {threadRuntimeIsActive(shell?.runtime) ? "Agent running" : "Agent window"}
              </span>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label={focused ? `Restore ${label}` : `Focus ${label}`}
                      onClick={() => useAgentWorkspaceStore.getState().toggleFocus(owner, threadId)}
                    />
                  }
                >
                  {focused ? <Minimize2Icon aria-hidden /> : <Maximize2Icon aria-hidden />}
                </TooltipTrigger>
                <TooltipPopup>{focused ? "Restore tiled layout" : "Focus this agent"}</TooltipPopup>
              </Tooltip>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={`Remove ${label} from workspace`}
                onClick={() => useAgentWorkspaceStore.getState().removeWindow(owner, threadId)}
              >
                <XIcon aria-hidden />
              </Button>
            </header>
          )}
          {primary ? (
            children
          ) : shell === null ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center text-sm text-muted-foreground">
              <p>This thread is unavailable.</p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => useAgentWorkspaceStore.getState().removeWindow(owner, threadId)}
              >
                Remove window
              </Button>
            </div>
          ) : (
            <ComposerHandleContext value={null}>
              <ChatView
                environmentId={owner.environmentId}
                threadId={threadId}
                routeKind="server"
                embedded="split"
              />
            </ComposerHandleContext>
          )}
        </section>
      </BackgroundThreadContext>
    </AgentWindowVisibleContext>
  );
}

type Axis = "column" | "row";

function applyTrackSizes(canvas: HTMLElement, axis: Axis, sizes: readonly number[]) {
  sizes.forEach((size, index) => canvas.style.setProperty(`--agent-${axis}-${index}`, `${size}%`));
  sizes
    .slice(0, -1)
    .forEach((_, index) =>
      canvas.style.setProperty(
        `--agent-${axis}-boundary-${index}`,
        `${sizes.slice(0, index + 1).reduce((sum, size) => sum + size, 0)}%`,
      ),
    );
}

function AgentResizeHandle({
  owner,
  canvasRef,
  axis,
  boundary,
  sizes,
  sizesKey,
}: {
  owner: ScopedThreadRef;
  canvasRef: RefObject<HTMLDivElement | null>;
  axis: Axis;
  boundary: number;
  sizes: number[];
  sizesKey: string;
}) {
  const drag = useRef<{
    start: number;
    extent: number;
    initial: number[];
    current: number[];
  } | null>(null);
  const vertical = axis === "column";
  const value = sizes.slice(0, boundary + 1).reduce((sum, size) => sum + size, 0);
  return (
    <div
      role="separator"
      tabIndex={0}
      aria-label={`Resize agent ${vertical ? "columns" : "rows"} ${boundary + 1}`}
      aria-orientation={vertical ? "vertical" : "horizontal"}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(value)}
      className={cn(
        "agent-resize-handle absolute z-20 touch-none outline-none",
        vertical
          ? "inset-y-0 w-2 -translate-x-1/2 cursor-col-resize"
          : "inset-x-0 h-2 -translate-y-1/2 cursor-row-resize",
      )}
      style={{ [vertical ? "left" : "top"]: `var(--agent-${axis}-boundary-${boundary})` }}
      onDoubleClick={() =>
        useAgentWorkspaceStore
          .getState()
          .setSizes(owner, sizesKey, agentTrackSizes(undefined, sizes.length))
      }
      onKeyDown={(event) => {
        const negative = vertical ? "ArrowLeft" : "ArrowUp";
        const positive = vertical ? "ArrowRight" : "ArrowDown";
        if (![negative, positive, "Home", "End"].includes(event.key)) return;
        event.preventDefault();
        const delta =
          event.key === "Home"
            ? -100
            : event.key === "End"
              ? 100
              : (event.key === positive ? 1 : -1) * (event.shiftKey ? 10 : 5);
        useAgentWorkspaceStore
          .getState()
          .setSizes(owner, sizesKey, resizeAgentTracks(sizes, boundary, delta, 10));
      }}
      onPointerDown={(event) => {
        if (event.button !== 0 || !canvasRef.current) return;
        event.preventDefault();
        event.currentTarget.focus();
        const rect = canvasRef.current.getBoundingClientRect();
        drag.current = {
          start: vertical ? event.clientX : event.clientY,
          extent: vertical ? rect.width : rect.height,
          initial: sizes,
          current: sizes,
        };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        const session = drag.current;
        if (!session || !canvasRef.current || session.extent <= 0) return;
        const position = vertical ? event.clientX : event.clientY;
        session.current = resizeAgentTracks(
          session.initial,
          boundary,
          ((position - session.start) / session.extent) * 100,
          Math.min(20, (120 / session.extent) * 100),
        );
        applyTrackSizes(canvasRef.current, axis, session.current);
      }}
      onPointerUp={(event) => {
        if (!drag.current) return;
        useAgentWorkspaceStore.getState().setSizes(owner, sizesKey, drag.current.current);
        drag.current = null;
        event.currentTarget.releasePointerCapture(event.pointerId);
      }}
      onLostPointerCapture={() => {
        if (drag.current && canvasRef.current)
          applyTrackSizes(canvasRef.current, axis, drag.current.initial);
        drag.current = null;
      }}
    >
      <span
        aria-hidden
        className={cn(
          "absolute rounded-full bg-transparent hover:bg-primary/50",
          vertical ? "inset-y-4 left-0.5 w-1" : "inset-x-4 top-0.5 h-1",
        )}
      />
    </div>
  );
}

export function AgentWorkspace({
  owner,
  children,
}: {
  owner: ScopedThreadRef;
  children: ReactNode;
}) {
  const saved = useAgentWorkspaceStore((state) => state.byOwner[scopedThreadKey(owner)]);
  const workspace = saved ?? defaultAgentWorkspace(owner);
  const gameDocked = useDockedGame(owner.environmentId);
  const tiled = workspace.threadIds.length > 1 || gameDocked;
  const compact = useMediaQuery("(max-width: 767px)");
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const single = workspace.focusedThreadId !== null || compact || !tiled;
  const shownId = workspace.focusedThreadId ?? workspace.activeThreadId;
  const { columns, rows } = single
    ? { columns: 1, rows: 1 }
    : agentGridDimensions(workspace.layout, workspace.threadIds.length + (gameDocked ? 1 : 0));
  const columnKey = `${workspace.layout}:columns:${columns}`;
  const rowKey = `${workspace.layout}:rows:${rows}`;
  const columnSizes = agentTrackSizes(workspace.sizes[columnKey], columns);
  const rowSizes = agentTrackSizes(workspace.sizes[rowKey], rows);
  const style: CSSProperties & Record<string, string | number> = {
    gridTemplateColumns: columnSizes
      .map((_, index) => `minmax(0, var(--agent-column-${index}))`)
      .join(" "),
    gridTemplateRows: rowSizes.map((_, index) => `minmax(0, var(--agent-row-${index}))`).join(" "),
  };
  for (const [axis, sizes] of [
    ["column", columnSizes],
    ["row", rowSizes],
  ] as const) {
    sizes.forEach((size, index) => {
      style[`--agent-${axis}-${index}`] = `${size}%`;
    });
    sizes.slice(0, -1).forEach((_, index) => {
      style[`--agent-${axis}-boundary-${index}`] =
        `${sizes.slice(0, index + 1).reduce((sum, size) => sum + size, 0)}%`;
    });
  }
  return (
    <AgentWorkspaceContext value={tiled}>
      <div
        className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
        data-agent-workspace={tiled ? workspace.layout : "single"}
      >
        {tiled ? (
          <header
            className={cn(
              "drag-region flex h-[var(--workspace-topbar-height)] shrink-0 items-center gap-2 border-b border-border bg-sidebar pl-(--workspace-gutter-start) pr-(--workspace-gutter-end) wco:pr-(--workspace-native-controls-inset)",
              COLLAPSED_SIDEBAR_TITLEBAR_INSET_CLASS,
            )}
          >
            <span className="hidden shrink-0 text-xs font-semibold sm:block">
              Agents{" "}
              <span className="ml-1 text-muted-foreground">{workspace.threadIds.length}</span>
            </span>
            <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto [-webkit-app-region:no-drag]">
              {workspace.threadIds.map((threadId) => (
                <AgentWindowTab
                  key={threadId}
                  threadRef={scopeThreadRef(owner.environmentId, threadId)}
                  active={workspace.activeThreadId === threadId}
                  onSelect={() => {
                    const store = useAgentWorkspaceStore.getState();
                    store.activate(owner, threadId);
                    if (
                      workspace.focusedThreadId !== null &&
                      workspace.focusedThreadId !== threadId
                    )
                      store.toggleFocus(owner, threadId);
                  }}
                />
              ))}
            </div>
            <div className="flex shrink-0 items-center gap-1 [-webkit-app-region:no-drag]">
              <div className="hidden md:block">
                <ToggleGroup
                  value={[workspace.layout]}
                  onValueChange={(value) => {
                    if (value[0])
                      useAgentWorkspaceStore.getState().setLayout(owner, value[0] as AgentLayout);
                  }}
                  aria-label="Agent window layout"
                >
                  {AGENT_LAYOUT_OPTIONS.map(({ value, label, Icon }) => (
                    <Tooltip key={value}>
                      <TooltipTrigger render={<ToggleGroupItem value={value} aria-label={label} />}>
                        <Icon aria-hidden className="size-4" />
                      </TooltipTrigger>
                      <TooltipPopup>{label}</TooltipPopup>
                    </Tooltip>
                  ))}
                </ToggleGroup>
              </div>
              <SplitChatControl threadRef={owner} />
              <KeepAwakeControl environmentId={owner.environmentId} />
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={
                  workspace.focusedThreadId === null ? "Focus active agent" : "Restore tiled layout"
                }
                onClick={() =>
                  useAgentWorkspaceStore.getState().toggleFocus(owner, workspace.activeThreadId)
                }
              >
                {workspace.focusedThreadId === null ? (
                  <Maximize2Icon aria-hidden />
                ) : (
                  <Minimize2Icon aria-hidden />
                )}
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Close agent workspace"
                onClick={() => useAgentWorkspaceStore.getState().closeWorkspace(owner)}
              >
                <XIcon aria-hidden />
              </Button>
            </div>
          </header>
        ) : null}
        <div className={cn("flex min-h-0 min-w-0 flex-1 flex-col", tiled && "bg-muted/50 p-2")}>
          <div ref={canvasRef} className="relative grid min-h-0 min-w-0 flex-1" style={style}>
            {workspace.threadIds.map((threadId) => (
              <div
                key={threadId === owner.threadId ? "primary" : threadId}
                className={cn(
                  "flex min-h-0 min-w-0 flex-col",
                  tiled && "p-1",
                  single && threadId !== shownId && "hidden",
                )}
              >
                <AgentWindow
                  owner={owner}
                  threadId={threadId}
                  tiled={tiled}
                  active={workspace.activeThreadId === threadId}
                  focused={workspace.focusedThreadId === threadId}
                  hidden={single && threadId !== shownId}
                >
                  {threadId === owner.threadId ? children : undefined}
                </AgentWindow>
              </div>
            ))}
            {gameDocked && !single ? (
              <div
                aria-label="Docked game tile"
                className="min-h-0 min-w-0 [anchor-name:--game-grid]"
              />
            ) : null}
            {columnSizes.slice(0, -1).map((_, boundary) => (
              <AgentResizeHandle
                key={`column:${workspace.threadIds[boundary]}`}
                owner={owner}
                canvasRef={canvasRef}
                axis="column"
                boundary={boundary}
                sizes={columnSizes}
                sizesKey={columnKey}
              />
            ))}
            {rowSizes.slice(0, -1).map((_, boundary) => (
              <AgentResizeHandle
                key={`row:${workspace.threadIds[boundary]}`}
                owner={owner}
                canvasRef={canvasRef}
                axis="row"
                boundary={boundary}
                sizes={rowSizes}
                sizesKey={rowKey}
              />
            ))}
          </div>
        </div>
      </div>
    </AgentWorkspaceContext>
  );
}
