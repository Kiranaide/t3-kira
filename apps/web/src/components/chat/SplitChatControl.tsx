import { scopedThreadKey } from "@t3tools/client-runtime/environment";
import type { ScopedThreadRef } from "@t3tools/contracts";
import { Columns2Icon } from "lucide-react";
import { useRef } from "react";

import { useRightPanelStore } from "../../rightPanelStore";
import { useEnvironmentThreadRefs, useQuietThreadShell } from "../../state/entities";
import { Button } from "../ui/button";
import { Menu, MenuTrigger, MenuPopup, MenuItem, MenuGroup, MenuGroupLabel } from "../ui/menu";
import { Tooltip, TooltipTrigger, TooltipPopup } from "../ui/tooltip";
import {
  threadContextDropTargetProps,
  useThreadContextDragGhost,
  useThreadContextDrop,
} from "./threadContextDrag";

function SplitChatMenuItem({
  parentRef,
  threadRef,
}: {
  parentRef: ScopedThreadRef;
  threadRef: ScopedThreadRef;
}) {
  const shell = useQuietThreadShell(threadRef);
  if (shell === null) return null;
  return (
    <MenuItem
      onClick={() => useRightPanelStore.getState().openSideChat(parentRef, threadRef.threadId)}
    >
      <span className="max-w-72 truncate">{shell.title || "Untitled chat"}</span>
    </MenuItem>
  );
}

export function SplitChatControl({ threadRef }: { threadRef: ScopedThreadRef }) {
  const refs = useEnvironmentThreadRefs(threadRef.environmentId);
  const candidates = refs.filter((ref) => ref.threadId !== threadRef.threadId);
  return (
    <Menu>
      <Tooltip>
        <TooltipTrigger
          render={
            <MenuTrigger
              render={<Button variant="ghost" size="icon-sm" aria-label="Open chat beside" />}
            />
          }
        >
          <Columns2Icon className="size-4" />
        </TooltipTrigger>
        <TooltipPopup side="bottom">Open chat beside</TooltipPopup>
      </Tooltip>
      <MenuPopup align="end">
        <MenuGroup>
          <MenuGroupLabel>Open chat beside</MenuGroupLabel>
          {candidates.length === 0 ? (
            <MenuItem disabled>No other chats in this environment</MenuItem>
          ) : null}
          {candidates.map((ref) => (
            <SplitChatMenuItem key={scopedThreadKey(ref)} parentRef={threadRef} threadRef={ref} />
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
        useRightPanelStore.getState().openSideChat(threadRef, ref.threadId);
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
