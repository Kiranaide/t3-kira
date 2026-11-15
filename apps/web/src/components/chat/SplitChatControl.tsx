import { scopedThreadKey } from "@t3tools/client-runtime/environment";
import type { ScopedThreadRef } from "@t3tools/contracts";
import { CheckIcon, Columns2Icon, LayoutGridIcon, Rows2Icon } from "lucide-react";
import { useRef } from "react";

import {
  AGENT_WINDOW_LIMIT,
  defaultAgentWorkspace,
  useAgentWorkspaceStore,
} from "../../agentWorkspaceStore";
import { useEnvironmentThreadRefs, useQuietThreadShell } from "../../state/entities";
import { Button } from "../ui/button";
import {
  Menu,
  MenuTrigger,
  MenuPopup,
  MenuItem,
  MenuGroup,
  MenuGroupLabel,
  MenuSeparator,
  MenuRadioGroup,
  MenuRadioItem,
  MenuRadioItemIndicator,
} from "../ui/menu";
import { Tooltip, TooltipTrigger, TooltipPopup } from "../ui/tooltip";
import {
  threadContextDropTargetProps,
  useThreadContextDragGhost,
  useThreadContextDrop,
} from "./threadContextDrag";

function SplitChatMenuItem({
  parentRef,
  threadRef,
  selected,
  full,
}: {
  parentRef: ScopedThreadRef;
  threadRef: ScopedThreadRef;
  selected: boolean;
  full: boolean;
}) {
  const shell = useQuietThreadShell(threadRef);
  if (shell === null) return null;
  return (
    <MenuItem
      disabled={full && !selected}
      onClick={() => useAgentWorkspaceStore.getState().addWindow(parentRef, threadRef)}
    >
      <span className="max-w-72 truncate">{shell.title || "Untitled chat"}</span>
      {selected ? <CheckIcon aria-hidden className="ml-auto size-4" /> : null}
    </MenuItem>
  );
}

export function SplitChatControl({ threadRef }: { threadRef: ScopedThreadRef }) {
  const refs = useEnvironmentThreadRefs(threadRef.environmentId);
  const candidates = refs.filter((ref) => ref.threadId !== threadRef.threadId);
  const saved = useAgentWorkspaceStore((state) => state.byOwner[scopedThreadKey(threadRef)]);
  const workspace = saved ?? defaultAgentWorkspace(threadRef);
  const full = workspace.threadIds.length >= AGENT_WINDOW_LIMIT;
  return (
    <Menu>
      <Tooltip>
        <TooltipTrigger
          render={
            <MenuTrigger
              render={<Button variant="ghost" size="icon-sm" aria-label="Manage agent windows" />}
            />
          }
        >
          <LayoutGridIcon aria-hidden className="size-4" />
        </TooltipTrigger>
        <TooltipPopup side="bottom">Manage agent windows</TooltipPopup>
      </Tooltip>
      <MenuPopup align="end">
        <MenuGroup>
          <MenuGroupLabel>Window layout</MenuGroupLabel>
          <MenuRadioGroup
            value={workspace.layout}
            onValueChange={(value) => {
              if (value === "grid" || value === "columns" || value === "rows")
                useAgentWorkspaceStore.getState().setLayout(threadRef, value);
            }}
          >
            {(
              [
                { value: "grid", label: "Grid", Icon: LayoutGridIcon },
                { value: "columns", label: "Columns", Icon: Columns2Icon },
                { value: "rows", label: "Rows", Icon: Rows2Icon },
              ] as const
            ).map(({ value, label, Icon }) => (
              <MenuRadioItem key={value} value={value}>
                <span className="flex items-center gap-2">
                  <Icon aria-hidden className="size-4" />
                  <span className="flex-1">{label}</span>
                  <MenuRadioItemIndicator />
                </span>
              </MenuRadioItem>
            ))}
          </MenuRadioGroup>
        </MenuGroup>
        <MenuSeparator />
        <MenuGroup>
          <MenuGroupLabel>
            Add agent window {workspace.threadIds.length}/{AGENT_WINDOW_LIMIT}
          </MenuGroupLabel>
          {candidates.length === 0 ? (
            <MenuItem disabled>No other chats in this environment</MenuItem>
          ) : null}
          {candidates.map((ref) => (
            <SplitChatMenuItem
              key={scopedThreadKey(ref)}
              parentRef={threadRef}
              threadRef={ref}
              selected={workspace.threadIds.includes(ref.threadId)}
              full={full}
            />
          ))}
        </MenuGroup>
      </MenuPopup>
    </Menu>
  );
}

export function SplitChatDropTarget({ threadRef }: { threadRef: ScopedThreadRef }) {
  const targetRef = useRef<HTMLDivElement | null>(null);
  const ghost = useThreadContextDragGhost();
  useThreadContextDrop(targetRef, threadRef.environmentId, scopedThreadKey(threadRef), (refs) => {
    for (const ref of refs) {
      if (ref.environmentId === threadRef.environmentId && ref.threadId !== threadRef.threadId) {
        useAgentWorkspaceStore.getState().addWindow(threadRef, ref);
      }
    }
  });
  return (
    <div
      ref={targetRef}
      {...threadContextDropTargetProps()}
      data-split-chat-drop-target
      className={
        ghost === null
          ? "hidden"
          : "absolute right-3 top-14 bottom-24 z-50 flex w-1/3 items-center justify-center rounded-xl border-2 border-dashed border-primary/50 bg-background/95 p-4 text-center text-sm text-foreground shadow-lg data-[thread-context-over]:border-primary data-[thread-context-over]:bg-accent"
      }
    >
      <span className="pointer-events-none flex flex-col items-center gap-2">
        <Columns2Icon className="size-6" />
        Drop to open chat beside
      </span>
    </div>
  );
}
