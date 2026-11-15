import type { GitActivityCommit, GitActivityResult } from "@t3tools/contracts";
import * as Cache from "effect/Cache";
import * as Clock from "effect/Clock";
import * as Context from "effect/Context";
import * as Duration from "effect/Duration";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import * as BuiltInDrivers from "./builtInDrivers.ts";
import * as SourceControlDiscovery from "./SourceControlDiscovery.ts";

/** One repository commit may be visible to several accounts or repeated on search pages. */
export function mergeActivityCommits(commits: readonly GitActivityCommit[]): GitActivityCommit[] {
  const merged = new Map<string, GitActivityCommit>();
  for (const commit of commits) {
    const key = `${commit.provider}:${commit.host.toLowerCase()}:${commit.repository.toLowerCase()}:${commit.sha.toLowerCase()}`;
    const previous = merged.get(key);
    merged.set(
      key,
      previous === undefined
        ? commit
        : {
            ...previous,
            accountIds: [...new Set([...previous.accountIds, ...commit.accountIds])],
          },
    );
  }
  return [...merged.values()].sort((a, b) => b.authoredAt.localeCompare(a.authoredAt));
}

export class SourceControlActivity extends Context.Service<
  SourceControlActivity,
  {
    readonly read: (refresh: boolean) => Effect.Effect<GitActivityResult>;
  }
>()("t3/sourceControl/SourceControlActivity") {}

export const make = Effect.gen(function* () {
  const discovery = yield* SourceControlDiscovery.SourceControlDiscovery;
  const drivers = yield* BuiltInDrivers.SourceControlDrivers;
  const cache = yield* Cache.makeWith(
    (endDate: string) =>
      Effect.gen(function* () {
        const startDate = DateTime.formatIsoDateUtc(
          DateTime.subtract(DateTime.makeUnsafe(`${endDate}T00:00:00Z`), { days: 364 }),
        );
        const providers = (yield* discovery.discover).sourceControlProviders;
        const results = yield* Effect.forEach(
          drivers,
          ({ driver, instance }) => {
            const provider = providers.find((entry) => entry.kind === driver.kind);
            return instance.activity !== undefined && provider !== undefined
              ? instance.activity({ auth: provider.auth, startDate, endDate })
              : Effect.succeed({ accounts: [], commits: [] });
          },
          { concurrency: 2 },
        );
        return {
          accounts: results.flatMap((result) => result.accounts),
          commits: mergeActivityCommits(results.flatMap((result) => result.commits)),
          startDate,
          endDate,
          fetchedAt: DateTime.formatIso(DateTime.makeUnsafe(yield* Clock.currentTimeMillis)),
        } satisfies GitActivityResult;
      }),
    { capacity: 2, timeToLive: () => Duration.minutes(5) },
  );

  return SourceControlActivity.of({
    read: Effect.fn("SourceControlActivity.read")(function* (refresh) {
      const endDate = DateTime.formatIsoDateUtc(
        DateTime.makeUnsafe(yield* Clock.currentTimeMillis),
      );
      if (refresh) yield* Cache.invalidate(cache, endDate);
      return yield* Cache.get(cache, endDate);
    }),
  });
});

export const layer = Layer.effect(SourceControlActivity, make);
