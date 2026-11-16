import { EnvironmentId, type PreviewSessionSnapshot } from "@t3tools/contracts";
import * as Cause from "effect/Cause";
import { AsyncResult } from "effect/reactivity";
import { StrictMode } from "react";
import { expect, it, vi } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";

const mocks = vi.hoisted(() => ({
  available: true,
  canOperate: true,
  open: vi.fn(),
  close: vi.fn(),
}));

vi.mock("~/browser/previewRuntime", () => ({ usePreviewAvailable: () => mocks.available }));
vi.mock("~/state/session", () => ({ useEnvironmentScope: () => mocks.canOperate }));
vi.mock("~/state/preview", () => ({ previewEnvironment: { close: "close", open: "open" } }));
vi.mock("~/state/use-atom-command", () => ({
  useAtomCommand: (command: "open" | "close") => mocks[command],
}));
vi.mock("../preview/openPreviewSession", () => ({ openPreviewSession: mocks.open }));
vi.mock("../preview/PreviewView", () => ({
  PreviewView: () => (
    <div role="region" aria-label="Game browser">
      Game
    </div>
  ),
}));

import { act, render } from "../../../test/render";
import { QuickActionsPanel, GameWindowHost } from "./QuickActionsPanel";

function setup() {
  mocks.available = true;
  mocks.canOperate = true;
  mocks.open.mockReset();
  mocks.close.mockReset().mockResolvedValue(AsyncResult.success(undefined));
}

const panel = () => (
  <>
    <QuickActionsPanel environmentId={EnvironmentId.make("local")} />
    <GameWindowHost />
  </>
);
const opened = () => AsyncResult.success({ tabId: "game" } as PreviewSessionSnapshot);

it("keeps chat focusable and preserves the browser session when docking", async () => {
  setup();
  mocks.open.mockResolvedValue(opened());
  await using screen = await render(panel());
  await userEvent.click(screen.getByRole("button", { name: /^Wordle/ }));
  await expect.element(page.getByRole("region", { name: "Game browser" })).toBeVisible();

  await userEvent.click(page.getByRole("button", { name: "Dock game beside chat" }));
  await expect.element(page.getByRole("button", { name: "Float game", exact: true })).toBeVisible();
  expect(mocks.open).toHaveBeenCalledOnce();
  expect(mocks.close).not.toHaveBeenCalled();
  const webview = document.createElement("input");
  document.body.append(webview);
  try {
    await act(() => webview.focus());
    await expect.element(page.getByRole("region", { name: "Wordle game window" })).toBeVisible();
    await userEvent.click(page.getByRole("button", { name: "Close game", exact: true }));
    await expect.element(page.getByRole("region", { name: /game window/ })).not.toBeInTheDocument();
    await vi.waitFor(() => expect(mocks.close).toHaveBeenCalledOnce());
  } finally {
    webview.remove();
  }
});

it("closes a game that finishes opening after the dialog is dismissed, including strict mode", async () => {
  setup();
  let finishOpening!: (result: ReturnType<typeof opened>) => void;
  mocks.open.mockReturnValue(
    new Promise<ReturnType<typeof opened>>((resolve) => {
      finishOpening = resolve;
    }),
  );
  await using screen = await render(<StrictMode>{panel()}</StrictMode>);
  await userEvent.click(screen.getByRole("button", { name: /^NFS Underground 2/ }));
  await expect.element(page.getByRole("status")).toBeVisible();
  await userEvent.click(page.getByRole("button", { name: "Close game", exact: true }));
  await expect.element(page.getByRole("region", { name: /game window/ })).not.toBeInTheDocument();
  expect(mocks.close).not.toHaveBeenCalled();

  await act(() => finishOpening(opened()));
  await vi.waitFor(() => expect(mocks.close.mock.calls.length).toBe(mocks.open.mock.calls.length));
  const openedThreads = mocks.open.mock.calls.map(([input]) => input.threadRef.threadId);
  const closedThreads = mocks.close.mock.calls.map(([input]) => input.input.threadId);
  expect(new Set(openedThreads).size).toBe(openedThreads.length);
  expect(closedThreads.toSorted()).toEqual(openedThreads.toSorted());
});

it("shows an opening failure without mounting a browser and prevents opening without preview access", async () => {
  setup();
  mocks.open.mockResolvedValue(AsyncResult.failure(Cause.fail(new Error("Browser unavailable"))));
  await using screen = await render(panel());
  await userEvent.click(screen.getByRole("button", { name: /^Wordle/ }));
  await expect.element(page.getByRole("alert")).toHaveTextContent("Browser unavailable");
  await expect.element(page.getByRole("region", { name: "Game browser" })).not.toBeInTheDocument();
  await userEvent.click(page.getByRole("button", { name: "Close game", exact: true }));
  await expect.element(page.getByRole("region", { name: /game window/ })).not.toBeInTheDocument();

  mocks.canOperate = false;
  await screen.rerender(panel());
  await expect.element(screen.getByRole("button", { name: /^Wordle/ })).toBeDisabled();
  await expect.element(screen.getByRole("button", { name: /^NFS Underground 2/ })).toBeDisabled();
});
