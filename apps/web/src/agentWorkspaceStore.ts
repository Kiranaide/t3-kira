import { parseScopedThreadKey, scopedThreadKey } from "@t3tools/client-runtime/environment";
import { ThreadId, type ScopedThreadRef } from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { resolveStorage } from "./lib/storage";

export const AGENT_WINDOW_LIMIT = 4;
export const AgentLayout = Schema.Literals(["grid", "columns", "rows"]);
export type AgentLayout = typeof AgentLayout.Type;

const AgentWorkspace = Schema.Struct({
  threadIds: Schema.Array(ThreadId),
  layout: AgentLayout,
  activeThreadId: ThreadId,
  focusedThreadId: Schema.NullOr(ThreadId),
  sizes: Schema.Record(Schema.String, Schema.Array(Schema.Number)),
});
export type AgentWorkspace = typeof AgentWorkspace.Type;

export function defaultAgentWorkspace(owner: ScopedThreadRef): AgentWorkspace {
  return {
    threadIds: [owner.threadId],
    layout: "grid",
    activeThreadId: owner.threadId,
    focusedThreadId: null,
    sizes: {},
  };
}

export function agentGridDimensions(layout: AgentLayout, count: number) {
  const columns = layout === "rows" ? 1 : layout === "columns" ? count : Math.min(2, count);
  return { columns, rows: Math.ceil(count / columns) };
}

export function agentTrackSizes(sizes: readonly number[] | undefined, count: number): number[] {
  return sizes?.length === count && sizes.every((size) => Number.isFinite(size) && size > 0)
    ? sizes.map((size) => (size / sizes.reduce((sum, value) => sum + value, 0)) * 100)
    : Array.from({ length: count }, () => 100 / count);
}

export function resizeAgentTracks(
  sizes: readonly number[],
  boundary: number,
  delta: number,
  minimum: number,
): number[] {
  const first = sizes[boundary];
  const second = sizes[boundary + 1];
  if (first === undefined || second === undefined) return [...sizes];
  const pair = first + second;
  const floor = Math.min(minimum, pair / 2);
  const next = Math.max(floor, Math.min(pair - floor, first + delta));
  return sizes.map((size, index) =>
    index === boundary ? next : index === boundary + 1 ? pair - next : size,
  );
}

interface AgentWorkspaceStore {
  byOwner: Record<string, AgentWorkspace>;
  addWindow: (owner: ScopedThreadRef, thread: ScopedThreadRef) => void;
  removeWindow: (owner: ScopedThreadRef, threadId: ThreadId) => void;
  setLayout: (owner: ScopedThreadRef, layout: AgentLayout) => void;
  activate: (owner: ScopedThreadRef, threadId: ThreadId) => void;
  toggleFocus: (owner: ScopedThreadRef, threadId: ThreadId) => void;
  setSizes: (owner: ScopedThreadRef, key: string, sizes: readonly number[]) => void;
  closeWorkspace: (owner: ScopedThreadRef) => void;
}

const PersistedWorkspaces = Schema.Struct({
  byOwner: Schema.Record(Schema.String, AgentWorkspace),
});
const decodeWorkspaces = Schema.decodeUnknownOption(PersistedWorkspaces);

export function restoreAgentWorkspaces(persisted: unknown): Record<string, AgentWorkspace> {
  const decoded = decodeWorkspaces(persisted);
  if (decoded._tag === "None") return {};
  return Object.fromEntries(
    Object.entries(decoded.value.byOwner).flatMap(([key, workspace]) => {
      const owner = parseScopedThreadKey(key);
      if (!owner) return [];
      const threadIds = [...new Set([owner.threadId, ...workspace.threadIds])].slice(
        0,
        AGENT_WINDOW_LIMIT,
      );
      return [
        [
          key,
          {
            ...workspace,
            threadIds,
            activeThreadId: threadIds.includes(workspace.activeThreadId)
              ? workspace.activeThreadId
              : owner.threadId,
            focusedThreadId:
              workspace.focusedThreadId !== null && threadIds.includes(workspace.focusedThreadId)
                ? workspace.focusedThreadId
                : null,
          },
        ],
      ];
    }),
  );
}

export const useAgentWorkspaceStore = create<AgentWorkspaceStore>()(
  persist(
    (set) => {
      const update = (owner: ScopedThreadRef, fn: (current: AgentWorkspace) => AgentWorkspace) =>
        set((state) => ({
          byOwner: {
            ...state.byOwner,
            [scopedThreadKey(owner)]: fn(
              state.byOwner[scopedThreadKey(owner)] ?? defaultAgentWorkspace(owner),
            ),
          },
        }));
      return {
        byOwner: {},
        addWindow: (owner, thread) => {
          if (owner.environmentId !== thread.environmentId || owner.threadId === thread.threadId)
            return;
          update(owner, (current) => {
            if (current.threadIds.includes(thread.threadId)) {
              return { ...current, activeThreadId: thread.threadId, focusedThreadId: null };
            }
            if (current.threadIds.length >= AGENT_WINDOW_LIMIT) return current;
            return {
              ...current,
              threadIds: [...current.threadIds, thread.threadId],
              activeThreadId: thread.threadId,
              focusedThreadId: null,
            };
          });
        },
        removeWindow: (owner, threadId) => {
          if (threadId === owner.threadId) return;
          update(owner, (current) => ({
            ...current,
            threadIds: current.threadIds.filter((id) => id !== threadId),
            activeThreadId:
              current.activeThreadId === threadId ? owner.threadId : current.activeThreadId,
            focusedThreadId: current.focusedThreadId === threadId ? null : current.focusedThreadId,
          }));
        },
        setLayout: (owner, layout) =>
          update(owner, (current) => ({ ...current, layout, focusedThreadId: null })),
        activate: (owner, threadId) =>
          update(owner, (current) =>
            current.threadIds.includes(threadId)
              ? { ...current, activeThreadId: threadId }
              : current,
          ),
        toggleFocus: (owner, threadId) =>
          update(owner, (current) =>
            current.threadIds.includes(threadId)
              ? {
                  ...current,
                  activeThreadId: threadId,
                  focusedThreadId: current.focusedThreadId === threadId ? null : threadId,
                }
              : current,
          ),
        setSizes: (owner, key, sizes) =>
          update(owner, (current) => ({
            ...current,
            sizes: { ...current.sizes, [key]: [...sizes] },
          })),
        closeWorkspace: (owner) => update(owner, () => defaultAgentWorkspace(owner)),
      };
    },
    {
      name: "t3-kira:agent-workspaces",
      version: 1,
      storage: createJSONStorage(() =>
        resolveStorage(typeof window === "undefined" ? undefined : window.localStorage),
      ),
      partialize: ({ byOwner }) => ({ byOwner }),
      merge: (persisted, current) => ({ ...current, byOwner: restoreAgentWorkspaces(persisted) }),
    },
  ),
);
