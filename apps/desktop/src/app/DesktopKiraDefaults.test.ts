import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

import { initializeKiraSettings } from "./DesktopKiraDefaults.ts";

it.effect("initializes a fresh Kira home with Daylight Blue", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const root = yield* fs.makeTempDirectoryScoped({ prefix: "t3-kira-defaults-" });
    const settingsPath = path.join(root, "userdata", "settings.json");
    yield* initializeKiraSettings(settingsPath);
    const settings = JSON.parse(yield* fs.readFileString(settingsPath));
    assert.equal(settings.defaultTheme, "daylight-blue");
    assert.match(settings.defaultThemeSetAt, /^\d{4}-\d{2}-\d{2}T/);
  }).pipe(Effect.provide(NodeServices.layer)),
);

it.effect.each(["{}", '{"defaultTheme":"grove","defaultThemeSetAt":"saved"}'])(
  "preserves existing Kira settings: %s",
  (contents) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped({ prefix: "t3-kira-defaults-" });
      const settingsPath = path.join(root, "settings.json");
      yield* fs.writeFileString(settingsPath, contents);
      yield* initializeKiraSettings(settingsPath);
      assert.equal(yield* fs.readFileString(settingsPath), contents);
    }).pipe(Effect.provide(NodeServices.layer)),
);
