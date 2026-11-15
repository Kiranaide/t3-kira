import { Atom } from "effect/reactivity";
import * as Option from "effect/Option";
import { EnvironmentId } from "@t3tools/contracts";
import { sourceControlClients } from "@t3tools/client-runtime/source-control-clients";
import { expect, it, vi } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser";
import { render } from "../../../test/render";
import { SourceControlAccountSettings } from "./SourceControlAccountSettings";

const definition = sourceControlClients.find("github")!;

const state = vi.hoisted(() => ({ open: vi.fn(), write: vi.fn(), close: vi.fn() }));
vi.mock("../../hooks/useSettings", async (original) => ({
  ...(await original<typeof import("../../hooks/useSettings")>()),
  useEnvironmentSettings: () => ({ hosts: {} }),
}));
vi.mock("../../hooks/useLocalStorage", async (original) => ({
  ...(await original<typeof import("../../hooks/useLocalStorage")>()),
  useLocalStorage: () => [false],
}));
vi.mock("../../state/session", async (original) => ({
  ...(await original<typeof import("../../state/session")>()),
  useEnvironmentScope: () => true,
  readEnvironmentScope: () => true,
}));
vi.mock("../../state/server", async (original) => ({
  ...(await original<typeof import("../../state/server")>()),
  serverEnvironment: {
    configValueAtom: () => Atom.make({ cwd: "C:/test", keybindings: [] }),
    updateSettings: "save",
  },
}));
vi.mock("../../state/terminal", async (original) => ({
  ...(await original<typeof import("../../state/terminal")>()),
  terminalEnvironment: { open: "open", write: "write", close: "close" },
}));
vi.mock("../../state/terminalSessions", async (original) => ({
  ...(await original<typeof import("../../state/terminalSessions")>()),
  useThreadRunningTerminalIds: () => [],
}));
vi.mock("../../state/use-atom-command", () => ({
  useAtomCommand: (command: keyof typeof state) => state[command],
}));
vi.mock("../ThreadTerminalDrawer", () => ({
  TerminalViewport: () => <div>Sign-in terminal</div>,
}));

it("opens a second GitHub login without removing the existing account", async () => {
  for (const command of Object.values(state))
    command.mockReset().mockResolvedValue({ _tag: "Success", value: {} });
  await using screen = await render(
    <SourceControlAccountSettings
      environmentId={EnvironmentId.make("test")}
      definition={definition}
      credentials={definition.credentials!}
      auth={{
        status: "authenticated",
        host: Option.some("github.com"),
        account: Option.some("personal"),
        detail: Option.none(),
        accounts: [{ host: "github.com", account: "personal", active: true, authenticated: true }],
      }}
      onSaved={() => {}}
    />,
  );
  await userEvent.click(screen.getByRole("button", { name: "Add GitHub account" }));
  await vi.waitFor(() =>
    expect(state.write).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({ data: "gh auth login --hostname github.com --web" }),
      }),
    ),
  );
  await expect.element(screen.getByText("Signed in as")).toBeVisible();
  await expect.element(screen.getByText("Sign-in terminal")).toBeVisible();
});
