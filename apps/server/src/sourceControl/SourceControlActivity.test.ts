import { describe, expect, it } from "@effect/vitest";
import { SourceControlProviderKind, type GitActivityCommit } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as TestClock from "effect/testing/TestClock";

import * as BuiltInDrivers from "./builtInDrivers.ts";
import * as SourceControlActivity from "./SourceControlActivity.ts";
import * as SourceControlDiscovery from "./SourceControlDiscovery.ts";

const github = SourceControlProviderKind.make("github");
const commit: GitActivityCommit = {
  provider: github,
  host: "github.com",
  accountIds: ["personal"],
  repository: "team/app",
  sha: "a".repeat(40),
  message: "Commit",
  authoredAt: "2026-10-01T12:00:00.000Z",
  url: "https://github.com/team/app/commit/a",
};

describe("source control activity", () => {
  it("deduplicates within repositories and retains all account identities", () => {
    const commits = SourceControlActivity.mergeActivityCommits([
      commit,
      { ...commit, accountIds: ["work"] },
      { ...commit, accountIds: ["personal"] },
      { ...commit, repository: "team/other" },
    ]);
    expect(commits).toHaveLength(2);
    expect(commits[0]?.accountIds).toEqual(["personal", "work"]);
    expect(commits[1]?.repository).toBe("team/other");
  });

  it.effect("caches the same UTC year, refreshes explicitly, and rolls over at midnight", () => {
    let reads = 0;
    const dependencies = Layer.mergeAll(
      Layer.succeed(BuiltInDrivers.SourceControlDrivers, []),
      Layer.succeed(SourceControlDiscovery.SourceControlDiscovery, {
        discover: Effect.sync(() => {
          reads++;
          return {
            versionControlSystems: [],
            sourceControlProviders: [
              {
                kind: github,
                label: "GitHub",
                status: "available" as const,
                version: Option.none(),
                installHint: "Sign in",
                detail: Option.none(),
                auth: {
                  status: "unauthenticated" as const,
                  host: Option.none(),
                  account: Option.none(),
                  detail: Option.none(),
                },
              },
            ],
          };
        }),
      }),
    );
    return Effect.gen(function* () {
      yield* TestClock.setTime(Date.parse("2026-11-15T23:59:00Z"));
      const activity = yield* SourceControlActivity.make;
      const first = yield* activity.read(false);
      expect(first.startDate).toBe("2025-11-16");
      expect(first.endDate).toBe("2026-11-15");
      yield* activity.read(false);
      expect(reads).toBe(1);
      yield* activity.read(true);
      expect(reads).toBe(2);
      yield* TestClock.adjust("2 minutes");
      expect((yield* activity.read(false)).endDate).toBe("2026-11-16");
      expect(reads).toBe(3);
    }).pipe(Effect.provide(dependencies));
  });
});
