import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { expect, it } from "vite-plus/test";

import { act, render } from "../../../test/render";
import { selectThreadRightPanelState, useRightPanelStore } from "../../rightPanelStore";
import { SplitChatDropTarget } from "./SplitChatControl";
import {
  dropThreadContext,
  endThreadContextDrag,
  moveThreadContextDrag,
} from "./threadContextDrag";

it("drops sidebar chats into the latest pane without opening the parent or another environment", async () => {
  const environmentId = EnvironmentId.make("split-environment");
  const first = scopeThreadRef(environmentId, ThreadId.make("first"));
  const latest = scopeThreadRef(environmentId, ThreadId.make("latest"));
  const other = scopeThreadRef(environmentId, ThreadId.make("other"));
  const remote = scopeThreadRef(EnvironmentId.make("remote"), ThreadId.make("remote-thread"));
  useRightPanelStore.setState({ byThreadKey: {} });
  await using screen = await render(
    <div style={{ position: "relative", width: 900, height: 500 }}>
      <SplitChatDropTarget threadRef={first} />
    </div>,
  );
  await screen.rerender(
    <div style={{ position: "relative", width: 900, height: 500 }}>
      <SplitChatDropTarget threadRef={latest} />
    </div>,
  );
  using _cleanup = { [Symbol.dispose]: endThreadContextDrag };
  await act(() => moveThreadContextDrag({ x: 700, y: 200 }, { title: "Other", count: 1 }));
  const target = screen.container.querySelector<HTMLElement>("[data-split-chat-drop-target]")!;
  const rect = target.getBoundingClientRect();
  await act(() => {
    expect(
      dropThreadContext({ x: rect.left + 10, y: rect.top + 10 }, [latest, remote, other, other]),
    ).toBe(true);
  });
  expect(
    selectThreadRightPanelState(useRightPanelStore.getState().byThreadKey, first).surfaces,
  ).toEqual([]);
  expect(
    selectThreadRightPanelState(useRightPanelStore.getState().byThreadKey, latest).surfaces,
  ).toEqual([{ id: `side-chat:${other.threadId}`, kind: "side-chat", threadId: other.threadId }]);
});
