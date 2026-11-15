import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";

const encodeSettings = Schema.encodeEffect(
  Schema.fromJsonString(
    Schema.Struct({ defaultTheme: Schema.String, defaultThemeSetAt: Schema.String }),
  ),
);

export const initializeKiraSettings = Effect.fn("desktop.kira.initializeSettings")(function* (
  settingsPath: string,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  if (yield* fs.exists(settingsPath)) return;
  yield* fs.makeDirectory(path.dirname(settingsPath), { recursive: true });
  const settings = {
    defaultTheme: "daylight-blue",
    defaultThemeSetAt: DateTime.formatIso(yield* DateTime.now),
  };
  const encoded = yield* encodeSettings(settings);
  yield* fs.writeFileString(settingsPath, `${encoded}\n`, { flag: "wx" }).pipe(
    Effect.catchIf(
      (error) => error.reason._tag === "AlreadyExists",
      () => Effect.void,
    ),
  );
});
