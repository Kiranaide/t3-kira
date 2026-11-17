import { assert, it } from "@effect/vitest";
import * as NodeCrypto from "@effect/platform-node/NodeCrypto";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Layer from "effect/Layer";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as PlatformError from "effect/PlatformError";
import * as HttpClient from "effect/http/HttpClient";
import { ChildProcessSpawner } from "effect/process";
import * as NetService from "@t3tools/shared/Net";
import * as Fiber from "effect/Fiber";
import * as Option from "effect/Option";
import * as Ref from "effect/Ref";
import * as Stream from "effect/Stream";
import { vi } from "vite-plus/test";

vi.mock("electron", () => ({}));
vi.mock("@clerk/electron", () => ({ createClerkBridge: vi.fn() }));
vi.mock("@clerk/electron/storage", () => ({ storage: vi.fn() }));
vi.mock("../ipc/DesktopIpcHandlers.ts", () => ({
  installDesktopIpcHandlers: () => Effect.void,
}));
vi.mock("../updates/DesktopRemoteUpdates.ts", () => ({ listen: Effect.void }));
vi.mock("./DesktopStartupRecovery.ts", () => ({ listen: Effect.void }));

import * as DesktopApp from "./DesktopApp.ts";
import * as DesktopAppActivation from "./DesktopAppActivation.ts";
import * as DesktopAppIdentity from "./DesktopAppIdentity.ts";
import * as DesktopClerk from "./DesktopClerk.ts";
import * as DesktopEnvironment from "./DesktopEnvironment.ts";
import * as DesktopLegacyLocalStorage from "./DesktopLegacyLocalStorage.ts";
import * as DesktopLifecycle from "./DesktopLifecycle.ts";
import * as DesktopLinuxUrlHandler from "./DesktopLinuxUrlHandler.ts";
import * as DesktopPreReadyPlatform from "./DesktopPreReadyPlatform.ts";
import * as DesktopShutdown from "./DesktopShutdown.ts";
import * as DesktopState from "./DesktopState.ts";
import * as DesktopBackendPool from "../backend/DesktopBackendPool.ts";
import * as DesktopServerExposure from "../backend/DesktopServerExposure.ts";
import * as ElectronApp from "../electron/ElectronApp.ts";
import * as ElectronDialog from "../electron/ElectronDialog.ts";
import * as ElectronProtocol from "../electron/ElectronProtocol.ts";
import * as ElectronSafeStorage from "../electron/ElectronSafeStorage.ts";
import * as PreviewPasskeys from "../preview/Passkeys.ts";
import * as DesktopAppSettings from "../settings/DesktopAppSettings.ts";
import * as DesktopShellEnvironment from "../shell/DesktopShellEnvironment.ts";
import * as DesktopSnapShot from "../snapShot/DesktopSnapShot.ts";
import * as DesktopRendererHistory from "../telemetry/DesktopRendererHistory.ts";
import * as DesktopUpdates from "../updates/DesktopUpdates.ts";
import * as DesktopApplicationMenu from "../window/DesktopApplicationMenu.ts";
import * as DesktopWindow from "../window/DesktopWindow.ts";
import * as DesktopWslBackend from "../wsl/DesktopWslBackend.ts";

import * as BrowserImport from "../preview/BrowserImport/BrowserImport.ts";
import * as DesktopBackendConfiguration from "../backend/DesktopBackendConfiguration.ts";
import * as DesktopCliCommand from "./DesktopCliCommand.ts";
import * as DesktopCliShim from "./DesktopCliShim.ts";
import * as DesktopClientSettings from "../settings/DesktopClientSettings.ts";
import * as DesktopConnectionCatalogStore from "./DesktopConnectionCatalogStore.ts";
import * as DesktopIpc from "../ipc/DesktopIpc.ts";
import * as DesktopLocalEnvironmentAuth from "../backend/DesktopLocalEnvironmentAuth.ts";
import * as DesktopManagedPolicy from "./DesktopManagedPolicy.ts";
import * as DesktopPrimaryPaste from "./DesktopPrimaryPaste.ts";
import * as DesktopSshEnvironment from "../ssh/DesktopSshEnvironment.ts";
import * as DesktopSshPasswordPrompts from "../ssh/DesktopSshPasswordPrompts.ts";
import * as DesktopTelemetryPublisher from "../telemetry/DesktopTelemetryPublisher.ts";
import * as DesktopWebLinks from "./DesktopWebLinks.ts";
import * as DesktopWslEnvironment from "../wsl/DesktopWslEnvironment.ts";
import * as ElectronMenu from "../electron/ElectronMenu.ts";
import * as ElectronShell from "../electron/ElectronShell.ts";
import * as ElectronTheme from "../electron/ElectronTheme.ts";
import * as ElectronWindow from "../electron/ElectronWindow.ts";
import * as MacPermissions from "../permissions/MacPermissions.ts";
import * as PreviewManager from "../preview/Manager.ts";

interface StubbedDesktop {
  readonly localEnvironmentEnabled: boolean;
  readonly environment: Partial<DesktopEnvironment.DesktopEnvironment["Service"]>;
  readonly fileSystem: Layer.Layer<FileSystem.FileSystem>;
  readonly record: (event: string) => Effect.Effect<void>;
  readonly windowStarted: Deferred.Deferred<void>;
  readonly registerLinuxUrlHandler: Effect.Effect<void>;
  readonly backends?: ReadonlyArray<{ readonly stop: () => Effect.Effect<void> }>;
  readonly flushRendererHistory?: Effect.Effect<void>;
  readonly tokenRequested?: Deferred.Deferred<void>;
  readonly quitting?: Ref.Ref<boolean>;
  readonly quit?: Effect.Effect<void>;
  readonly showErrorBox?: (title: string, content: string) => Effect.Effect<void>;
}

const runStubbedDesktop = (stub: StubbedDesktop) =>
  Effect.gen(function* () {
    const quitting = stub.quitting ?? (yield* Ref.make(false));
    const runApp = DesktopApp.program
      .pipe(
        Effect.provide(NodeCrypto.layer),
        Effect.provideService(DesktopAppIdentity.DesktopAppIdentity, {
          resolveUserDataPath: Effect.succeed("/isolated/userdata"),
          configure: stub.record("identity"),
        } as DesktopAppIdentity.DesktopAppIdentity["Service"]),
        Effect.provideService(ElectronApp.ElectronApp, {
          setPath: () => Effect.void,
          whenReady: stub.record("ready"),
          quit: stub.quit ?? Effect.void,
        } as unknown as ElectronApp.ElectronApp["Service"]),
        Effect.provideService(ElectronDialog.ElectronDialog, {
          showErrorBox: stub.showErrorBox ?? (() => Effect.die("unexpected fatal startup error")),
        } as unknown as ElectronDialog.ElectronDialog["Service"]),
        Effect.provideService(DesktopEnvironment.DesktopEnvironment, {
          platform: "linux",
          isDevelopment: false,
          isPackaged: true,
          stateDir: "/isolated/userdata",
          configuredBackendPort: Option.some(3773),
          defaultDesktopSettings: { serverExposureMode: "local-only" },
          ...stub.environment,
        } as unknown as DesktopEnvironment.DesktopEnvironment["Service"]),
        Effect.provideService(DesktopPreReadyPlatform.DesktopPreReadyElectronOptions, {
          linux: null,
          linuxPasswordStoreCommandLine: "basic",
        }),
        Effect.provideService(DesktopShellEnvironment.DesktopShellEnvironment, {
          installIntoProcess: Effect.succeed(true),
          awaitDiscovery: Effect.succeed(true),
          awaitUserShellDiscovery: Effect.succeed(true),
          discoveryFinished: Effect.succeed(true),
          updates: Stream.empty,
        }),
        Effect.provideService(DesktopAppSettings.DesktopAppSettings, {
          load: Effect.void,
          get: Effect.succeed({
            localEnvironmentEnabled: stub.localEnvironmentEnabled,
            serverExposureMode: "local-only",
          }),
        } as unknown as DesktopAppSettings.DesktopAppSettings["Service"]),
        Effect.provideService(DesktopLifecycle.DesktopLifecycle, {
          register: Effect.void,
          relaunch: () => Effect.void,
        }),
        Effect.provideService(DesktopClerk.DesktopClerk, {
          configure: Effect.void,
        } as DesktopClerk.DesktopClerk["Service"]),
        Effect.provideService(ElectronSafeStorage.ElectronSafeStorage, {
          selectedStorageBackend: Effect.succeedNone,
        } as unknown as ElectronSafeStorage.ElectronSafeStorage["Service"]),
        Effect.provideService(PreviewPasskeys.PreviewPasskeys, {
          configure: Effect.void,
        } as PreviewPasskeys.PreviewPasskeys["Service"]),
        Effect.provideService(DesktopApplicationMenu.DesktopApplicationMenu, {
          configure: stub.record("menu"),
        }),
        Effect.provideService(DesktopUpdates.DesktopUpdates, {
          configure: Effect.void,
        } as unknown as DesktopUpdates.DesktopUpdates["Service"]),
        Effect.provideService(DesktopLinuxUrlHandler.DesktopLinuxUrlHandler, {
          register: stub.registerLinuxUrlHandler,
        }),
      )
      .pipe(
        Effect.provideService(ElectronProtocol.ElectronProtocol, {
          registerDesktopProtocol: () => Effect.void,
        } as unknown as ElectronProtocol.ElectronProtocol["Service"]),
        Effect.provideService(DesktopLegacyLocalStorage.DesktopLegacyLocalStorage, {
          load: () => Effect.void,
        } as unknown as DesktopLegacyLocalStorage.DesktopLegacyLocalStorage["Service"]),
        Effect.provideService(DesktopSnapShot.DesktopSnapShot, {
          initialize: Effect.void,
        } as DesktopSnapShot.DesktopSnapShot["Service"]),
        Effect.provideService(DesktopState.DesktopState, {
          quitting,
        } as DesktopState.DesktopState["Service"]),
        Effect.provideService(DesktopWindow.DesktopWindow, {
          ensureMain: stub
            .record("window")
            .pipe(Effect.andThen(Deferred.succeed(stub.windowStarted, undefined))),
          createMainIfBackendReady: stub
            .record("window")
            .pipe(Effect.andThen(Deferred.succeed(stub.windowStarted, undefined))),
        } as unknown as DesktopWindow.DesktopWindow["Service"]),
        Effect.provideService(DesktopBackendPool.DesktopBackendPool, {
          primary: Effect.succeed({
            start: stub.record("backend"),
            currentConfig: Effect.succeedSome({ preflightFailure: Option.none() }),
          }),
          list: Effect.succeed(stub.backends ?? []),
        } as unknown as DesktopBackendPool.DesktopBackendPool["Service"]),
        Effect.provideService(DesktopServerExposure.DesktopServerExposure, {
          configureFromSettings: () => Effect.succeed({ mode: "local-only" }),
          backendConfig: Effect.succeed({ httpBaseUrl: new URL("http://127.0.0.1:3773") }),
        } as unknown as DesktopServerExposure.DesktopServerExposure["Service"]),
        Effect.provideService(DesktopWslBackend.DesktopWslBackend, {
          reconcile: Effect.void,
        } as DesktopWslBackend.DesktopWslBackend["Service"]),
        Effect.provideService(DesktopAppActivation.DesktopAppActivation, {
          start: Effect.void,
        } as unknown as DesktopAppActivation.DesktopAppActivation["Service"]),
        Effect.provideService(DesktopRendererHistory.DesktopRendererHistory, {
          shutdown: stub.flushRendererHistory ?? Effect.void,
        } as DesktopRendererHistory.DesktopRendererHistory["Service"]),
      );
    return yield* runApp.pipe(
      Effect.provide(
        Layer.mergeAll(
          Layer.mock(BrowserImport.BrowserImport, {}),
          Layer.mock(ChildProcessSpawner.ChildProcessSpawner, {}),
          Layer.mock(DesktopBackendConfiguration.DesktopBackendConfiguration, {}),
          Layer.mock(DesktopCliCommand.DesktopCliCommand, {}),
          Layer.mock(DesktopClientSettings.DesktopClientSettings, {}),
          Layer.mock(DesktopConnectionCatalogStore.DesktopConnectionCatalogStore, {}),
          Layer.mock(DesktopIpc.DesktopIpc, {}),
          Layer.mock(DesktopLocalEnvironmentAuth.DesktopLocalEnvironmentAuth, {
            getBearerToken: stub
              .record("token")
              .pipe(
                Effect.andThen(
                  stub.tokenRequested
                    ? Deferred.succeed(stub.tokenRequested, undefined)
                    : Effect.void,
                ),
                Effect.as("token"),
              ),
          }),
          Layer.mock(DesktopManagedPolicy.DesktopManagedPolicy, {}),
          Layer.succeed(DesktopPrimaryPaste.DesktopPrimaryPaste, { enabled: true }),
          Layer.mock(DesktopSshEnvironment.DesktopSshEnvironment, {}),
          Layer.mock(DesktopSshPasswordPrompts.DesktopSshPasswordPrompts, {}),
          Layer.mock(DesktopTelemetryPublisher.DesktopTelemetryPublisher, {}),
          Layer.mock(DesktopWebLinks.DesktopWebLinks, {}),
          Layer.mock(DesktopWslEnvironment.DesktopWslEnvironment, {}),
          Layer.mock(ElectronMenu.ElectronMenu, {}),
          Layer.mock(ElectronShell.ElectronShell, {}),
          Layer.mock(ElectronTheme.ElectronTheme, {}),
          Layer.mock(ElectronWindow.ElectronWindow, {}),
          Layer.mock(MacPermissions.MacPermissions, {}),
          Layer.mock(PreviewManager.PreviewManager, {
            isBrowserPartition: () => {
              throw new Error("unexpected browser partition lookup");
            },
          }),
          stub.fileSystem,
          Layer.mock(NetService.NetService, {}),
          Path.layer,
          Layer.succeed(
            HttpClient.HttpClient,
            HttpClient.make(() => Effect.die("unexpected HTTP request")),
          ),
        ),
      ),
      Effect.forkScoped,
    );
  });

it.effect.each([
  { stopDefect: false, settingsFailure: false },
  { stopDefect: true, settingsFailure: false },
  { stopDefect: false, settingsFailure: true },
])(
  "finalizes desktop startup with stopDefect=$stopDefect and settingsFailure=$settingsFailure",
  ({ stopDefect, settingsFailure }) =>
    Effect.gen(function* () {
      const registrationStarted = yield* Deferred.make<void>();
      const releaseRegistration = yield* Deferred.make<void>();
      const registrationStopped = yield* Deferred.make<void>();
      const windowStarted = yield* Deferred.make<void>();
      const firstStopStarted = yield* Deferred.make<void>();
      const secondStopStarted = yield* Deferred.make<void>();
      const releaseStops = yield* Deferred.make<void>();
      const historyStarted = yield* Deferred.make<void>();
      const releaseHistory = yield* Deferred.make<void>();
      const tokenRequested = yield* Deferred.make<void>();
      const quitting = yield* Ref.make(false);
      const events: string[] = [];
      const startupErrors: string[] = [];
      const app = yield* runStubbedDesktop({
        localEnvironmentEnabled: true,
        environment: { serverSettingsPath: "/isolated/userdata/settings.json" },
        fileSystem: FileSystem.layerNoop({
          makeDirectory: () => Effect.void,
          writeFileString: settingsFailure
            ? (path) =>
                Effect.fail(
                  PlatformError.systemError({
                    _tag: "PermissionDenied",
                    module: "FileSystem",
                    method: "writeFileString",
                    pathOrDescriptor: path,
                  }),
                )
            : () => Effect.void,
        }),
        record: (event) =>
          Effect.sync(() => {
            events.push(event);
          }),
        windowStarted,
        tokenRequested,
        quitting,
        quit: Effect.sync(() => {
          events.push("quit");
        }),
        showErrorBox: (_title, content) =>
          settingsFailure
            ? Effect.sync(() => {
                startupErrors.push(content);
              })
            : Effect.die("unexpected fatal startup error"),
        registerLinuxUrlHandler: Deferred.succeed(registrationStarted, undefined).pipe(
          Effect.andThen(Deferred.await(releaseRegistration)),
          Effect.ensuring(Deferred.succeed(registrationStopped, undefined)),
        ),
        backends: [
          {
            stop: () =>
              Deferred.succeed(firstStopStarted, undefined).pipe(
                Effect.andThen(Deferred.await(releaseStops)),
                Effect.andThen(stopDefect ? Effect.die("stop defect") : Effect.void),
              ),
          },
          {
            stop: () =>
              Deferred.succeed(secondStopStarted, undefined).pipe(
                Effect.andThen(Deferred.await(releaseStops)),
              ),
          },
        ],
        flushRendererHistory: Deferred.succeed(historyStarted, undefined).pipe(
          Effect.andThen(Deferred.await(releaseHistory)),
          Effect.asVoid,
        ),
      });
      const shutdown = yield* DesktopShutdown.DesktopShutdown;
      if (settingsFailure) {
        yield* Deferred.succeed(releaseStops, undefined);
        yield* Deferred.succeed(releaseHistory, undefined);
        const result = yield* Fiber.await(app);
        assert.isTrue(Exit.isFailure(result));
        assert.lengthOf(startupErrors, 1);
        assert.include(startupErrors[0]!, "PermissionDenied");
        assert.isTrue(yield* Ref.get(quitting));
        assert.include(events, "quit");
        assert.notInclude(events, "backend");
        assert.isTrue(yield* shutdown.isComplete);
        return;
      }
      yield* Deferred.await(registrationStarted);
      yield* Deferred.await(windowStarted);
      yield* Deferred.await(tokenRequested);
      // The backend spawns before menus, and its token is minted without waiting for the renderer.
      assert.deepEqual(
        events.filter((event) => event !== "token"),
        ["identity", "ready", "identity", "backend", "menu", "window"],
      );
      assert.isAbove(events.indexOf("token"), events.indexOf("backend"));
      assert.isFalse(yield* Deferred.isDone(registrationStopped));
      yield* shutdown.request;
      yield* Deferred.await(firstStopStarted);
      yield* Deferred.await(secondStopStarted);
      assert.isFalse(yield* Deferred.isDone(historyStarted));
      assert.isFalse(yield* shutdown.isComplete);
      yield* Deferred.succeed(releaseStops, undefined);
      yield* Deferred.await(historyStarted);
      assert.isFalse(yield* shutdown.isComplete);
      yield* Deferred.succeed(releaseHistory, undefined);
      const result = yield* Fiber.await(app);
      assert.equal(Exit.isFailure(result), stopDefect);
      assert.isTrue(yield* shutdown.isComplete);
      assert.isTrue(yield* Deferred.isDone(registrationStopped));
    }).pipe(Effect.provide(DesktopShutdown.layer)),
);

it.effect("points a stale t3 launcher at the updated AppImage with Local environment off", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const baseDir = yield* fs.makeTempDirectoryScoped({ prefix: "t3-desktop-app-" });
    const launcher = DesktopCliShim.launcherPath({
      path,
      baseDir,
      platform: "linux",
    } as DesktopEnvironment.DesktopEnvironment["Service"]);
    const removedAppImage = path.join(baseDir, "T3-Code-0.1.6-x86_64.AppImage");
    const updatedAppImage = path.join(baseDir, "T3-Code-0.1.7-x86_64.AppImage");
    yield* fs.makeDirectory(path.dirname(launcher), { recursive: true });
    yield* fs.writeFileString(
      launcher,
      DesktopCliShim.renderCliShim({
        target: { kind: "appimage", appImage: removedAppImage, executableName: "t3code" },
        shimPath: launcher,
        t3Home: baseDir,
      }),
    );
    yield* fs.writeFileString(updatedAppImage, "", { mode: 0o755 });
    const windowStarted = yield* Deferred.make<void>();

    const app = yield* runStubbedDesktop({
      localEnvironmentEnabled: false,
      environment: {
        path,
        baseDir,
        serverRoot: path.join(baseDir, "resources", "app.asar"),
        serverSettingsPath: path.join(baseDir, "settings.json"),
        appImagePath: Option.some(updatedAppImage),
      },
      fileSystem: Layer.succeed(FileSystem.FileSystem, fs),
      record: () => Effect.void,
      windowStarted,
      registerLinuxUrlHandler: Effect.void,
    });
    yield* Deferred.await(windowStarted);
    yield* (yield* DesktopShutdown.DesktopShutdown).request;
    yield* Fiber.join(app);

    const content = yield* fs.readFileString(launcher);
    assert.include(
      content,
      `app='${updatedAppImage}'`,
      "startup left the t3 launcher pointing at the removed AppImage",
    );
  }).pipe(Effect.provide(Layer.mergeAll(DesktopShutdown.layer, NodeServices.layer))),
);
