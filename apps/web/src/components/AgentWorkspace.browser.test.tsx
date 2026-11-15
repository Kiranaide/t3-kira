import { scopeThreadRef, scopedThreadKey } from "@t3tools/client-runtime/environment";
import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { expect, it, vi } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";
import "../index.css";

vi.mock(import("../state/entities"), () => ({
  useQuietThreadShell: (ref) => (ref ? ({ title: ref.threadId, runtime: null } as never) : null),
  useEnvironmentThreadRefs: () => [],
}));
vi.mock(import("./ChatView"), () => ({ default: () => <textarea aria-label="Agent prompt" /> }));
vi.mock(import("../state/threads"), () => ({ threadFamilies: { mount: () => () => {} } as never }));

import { act, render } from "../../test/render";
import { useAgentWorkspaceStore } from "../agentWorkspaceStore";
import { AgentWorkspace } from "./AgentWorkspace";

it("keeps prompts mounted through resizing, layout changes, focus, and restoring the workspace", async () => {
  await page.viewport(1440, 900);
  useAgentWorkspaceStore.setState({ byOwner: {} });
  const owner = scopeThreadRef(EnvironmentId.make("tile-test"), ThreadId.make("Main"));
  const other = scopeThreadRef(owner.environmentId, ThreadId.make("Research"));
  await using screen = await render(
    <div style={{ display: "flex", width: 1200, height: 720 }}>
      <AgentWorkspace owner={owner}>
        <textarea aria-label="Main prompt" />
      </AgentWorkspace>
    </div>,
  );
  const primaryPrompt = screen.getByRole("textbox", { name: "Main prompt" });
  await userEvent.fill(primaryPrompt, "Keep this draft");
  const original = primaryPrompt.element();
  await act(() => useAgentWorkspaceStore.getState().addWindow(owner, other));
  await expect.element(primaryPrompt).toHaveValue("Keep this draft");
  expect(primaryPrompt.element()).toBe(original);
  const separator = screen.getByRole("separator", { name: "Resize agent columns 1" });
  await userEvent.click(separator);
  await userEvent.keyboard("{ArrowRight}");
  await expect.element(separator).toHaveAttribute("aria-valuenow", "55");
  await userEvent.fill(screen.getByRole("textbox", { name: "Agent prompt" }), "Research draft");
  await userEvent.click(screen.getByRole("button", { name: "Row layout" }));
  await expect
    .element(screen.getByRole("separator", { name: "Resize agent rows 1" }))
    .toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "Focus active agent" }));
  await expect.element(original).not.toBeVisible();
  await expect
    .element(screen.getByRole("textbox", { name: "Agent prompt" }))
    .toHaveValue("Research draft");
  await userEvent.click(screen.getByRole("button", { name: "Restore tiled layout", exact: true }));
  await expect.element(primaryPrompt).toBeVisible();
  await expect.element(primaryPrompt).toHaveValue("Keep this draft");
  await userEvent.click(screen.getByRole("button", { name: "Close agent workspace" }));
  expect(primaryPrompt.element()).toBe(original);
  expect(useAgentWorkspaceStore.getState().byOwner[scopedThreadKey(owner)]?.threadIds).toEqual([
    owner.threadId,
  ]);
});

it("fits four windows inside the grid without overflowing the canvas", async () => {
  await page.viewport(1440, 900);
  useAgentWorkspaceStore.setState({ byOwner: {} });
  const owner = scopeThreadRef(EnvironmentId.make("grid-test"), ThreadId.make("Main"));
  for (const name of ["Research", "Review", "Build"])
    useAgentWorkspaceStore
      .getState()
      .addWindow(owner, scopeThreadRef(owner.environmentId, ThreadId.make(name)));
  await using screen = await render(
    <div style={{ display: "flex", width: 1200, height: 720 }}>
      <AgentWorkspace owner={owner}>
        <textarea aria-label="Main prompt" />
      </AgentWorkspace>
    </div>,
  );
  const windows = [...screen.container.querySelectorAll<HTMLElement>("[data-agent-window]")];
  expect(windows).toHaveLength(4);
  const bounds = screen.container.firstElementChild!.getBoundingClientRect();
  for (const window of windows) {
    const rect = window.getBoundingClientRect();
    expect(rect.width).toBeGreaterThan(400);
    expect(rect.height).toBeGreaterThan(200);
    expect(rect.right).toBeLessThanOrEqual(bounds.right);
    expect(rect.bottom).toBeLessThanOrEqual(bounds.bottom);
  }
});
