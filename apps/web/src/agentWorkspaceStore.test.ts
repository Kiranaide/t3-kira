import { scopedThreadKey, scopeThreadRef } from "@t3tools/client-runtime/environment";
import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { expect, it } from "vite-plus/test";

import {
  agentGridDimensions,
  agentTrackSizes,
  defaultAgentWorkspace,
  resizeAgentTracks,
  restoreAgentWorkspaces,
  useAgentWorkspaceStore,
} from "./agentWorkspaceStore";

it("keeps windows scoped to their owner and caps duplicate and cross-environment additions", () => {
  useAgentWorkspaceStore.setState({ byOwner: {} });
  const owner = scopeThreadRef(EnvironmentId.make("local"), ThreadId.make("owner"));
  const store = useAgentWorkspaceStore.getState();
  const ref = (id: string) => scopeThreadRef(owner.environmentId, ThreadId.make(id));
  store.addWindow(owner, owner);
  store.addWindow(owner, scopeThreadRef(EnvironmentId.make("remote"), ThreadId.make("other")));
  expect(store.byOwner).toEqual({});
  for (const id of ["a", "a", "b", "c", "d"]) store.addWindow(owner, ref(id));
  expect(useAgentWorkspaceStore.getState().byOwner[scopedThreadKey(owner)]?.threadIds).toEqual([
    owner.threadId,
    ThreadId.make("a"),
    ThreadId.make("b"),
    ThreadId.make("c"),
  ]);
  store.toggleFocus(owner, ThreadId.make("a"));
  store.removeWindow(owner, owner.threadId);
  store.removeWindow(owner, ThreadId.make("a"));
  expect(useAgentWorkspaceStore.getState().byOwner[scopedThreadKey(owner)]).toMatchObject({
    activeThreadId: owner.threadId,
    focusedThreadId: null,
  });
  store.closeWorkspace(owner);
  expect(useAgentWorkspaceStore.getState().byOwner[scopedThreadKey(owner)]).toEqual(
    defaultAgentWorkspace(owner),
  );
});

it("restores valid windows without dangling focus or missing owners", () => {
  const owner = scopeThreadRef(EnvironmentId.make("local"), ThreadId.make("owner"));
  const restored = restoreAgentWorkspaces({
    byOwner: {
      [scopedThreadKey(owner)]: {
        ...defaultAgentWorkspace(owner),
        threadIds: ["a", "a", "b", "c", "d"],
        activeThreadId: "missing",
        focusedThreadId: "missing",
      },
    },
  });
  expect(restored[scopedThreadKey(owner)]).toMatchObject({
    threadIds: ["owner", "a", "b", "c"],
    activeThreadId: "owner",
    focusedThreadId: null,
  });
  expect(restoreAgentWorkspaces({ byOwner: { bad: { layout: "unknown" } } })).toEqual({});
});

it("resizes only adjacent windows while retaining the total and minimum size", () => {
  expect(resizeAgentTracks([25, 25, 25, 25], 1, 90, 10)).toEqual([25, 40, 10, 25]);
  expect(resizeAgentTracks([50, 50], 0, -90, 15)).toEqual([15, 85]);
  expect(agentTrackSizes([20, 40], 2)[0]).toBeCloseTo(100 / 3);
  expect(agentTrackSizes([20, 40], 2)[1]).toBeCloseTo(200 / 3);
  expect(agentTrackSizes([0, Number.NaN], 2)).toEqual([50, 50]);
  expect(agentGridDimensions("grid", 4)).toEqual({ columns: 2, rows: 2 });
  expect(agentGridDimensions("rows", 3)).toEqual({ columns: 1, rows: 3 });
  expect(agentGridDimensions("columns", 3)).toEqual({ columns: 3, rows: 1 });
});
