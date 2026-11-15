import type {
  GitActivityAccount,
  GitActivityCommit,
  GitActivityProviderResult,
  SourceControlProviderAuth,
} from "@t3tools/contracts";
import { SourceControlProviderKind } from "@t3tools/contracts";
import type { SourceControlDriverInstance } from "@t3tools/source-control-core/server/driver";
import { normalizeHost } from "@t3tools/source-control-core/server/pullRequestUtils";
import * as Effect from "effect/Effect";
import * as DateTime from "effect/DateTime";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";

import * as GitHubCredentials from "./GitHubCredentials.ts";
import * as GitHubRequestPolicy from "./GitHubRequestPolicy.ts";
import * as GitHubRest from "./GitHubRest.ts";

const decodeViewer = Schema.decodeUnknownOption(
  Schema.fromJsonString(
    Schema.Struct({
      login: Schema.String,
      avatar_url: Schema.optionalKey(Schema.String),
    }),
  ),
);

const decodePage = Schema.decodeUnknownOption(
  Schema.fromJsonString(
    Schema.Struct({
      total_count: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
      incomplete_results: Schema.Boolean,
      items: Schema.Array(
        Schema.Struct({
          sha: Schema.String,
          repository: Schema.Struct({ full_name: Schema.String }),
          commit: Schema.Struct({
            message: Schema.String,
            author: Schema.Struct({ date: Schema.String }),
          }),
        }),
      ),
    }),
  ),
);

interface AccountTarget {
  readonly host: string;
  readonly login: string;
  readonly exact: boolean;
  readonly authenticated: boolean;
}

function accountTargets(auth: SourceControlProviderAuth): readonly AccountTarget[] {
  const targets = new Map<string, AccountTarget>();
  for (const account of auth.accounts ?? []) {
    const host = normalizeHost(account.host);
    targets.set(`${host}/${account.account.toLowerCase()}`, {
      host,
      login: account.account,
      exact: account.environmentVariable === undefined,
      authenticated: account.authenticated,
    });
  }
  if (Option.isSome(auth.host) && Option.isSome(auth.account)) {
    const host = normalizeHost(auth.host.value);
    const login = auth.account.value;
    targets.set(`${host}/${login.toLowerCase()}`, {
      host,
      login,
      exact: false,
      authenticated: auth.status === "authenticated",
    });
  }
  return [...targets.values()];
}

const accountInfo = (target: AccountTarget): GitActivityAccount => ({
  id: `github:${target.host}:${target.login.toLowerCase()}`,
  provider: SourceControlProviderKind.make("github"),
  host: target.host,
  login: target.login,
  avatarUrl: null,
  status: target.authenticated ? "connected" : "unauthenticated",
  detail: target.authenticated ? null : "Sign in again in Settings → Source Control.",
});

/** Shares the driver's HTTP policy, credentials, and quota reserve with its other GitHub readers. */
export const make = Effect.gen(function* () {
  const api = yield* GitHubRest.GitHubRest;
  const credentials = yield* GitHubCredentials.GitHubCredentials;

  const readAccount = Effect.fn("GitHubActivity.readAccount")(function* (
    target: AccountTarget,
    startDate: string,
    endDate: string,
  ) {
    const account = accountInfo(target);
    if (!target.authenticated) return { accounts: [account], commits: [] };
    const read = Effect.gen(function* () {
      const held = target.exact
        ? yield* credentials.getForAccount(target.host, target.login)
        : yield* api.credential(target.host);
      const pinned = {
        host: target.host,
        token: held.token,
        credentialFingerprint: held.fingerprint,
        ...(held.source === undefined ? {} : { source: held.source }),
      };
      const request = (input: Omit<GitHubRest.GitHubRestInput, "host">) =>
        api
          .rest({
            ...input,
            host: target.host,
            allowReserve: false,
          })
          .pipe(Effect.provideService(GitHubRequestPolicy.PinnedGitHubCredential, pinned));
      const viewerResponse = yield* request({ operation: "activity.viewer", path: "user" });
      const viewer = decodeViewer(viewerResponse.body);
      if (
        viewerResponse.truncated ||
        Option.isNone(viewer) ||
        viewer.value.login.toLowerCase() !== target.login.toLowerCase() ||
        !/^[a-z\d][a-z\d._-]*$/i.test(viewer.value.login)
      ) {
        return {
          accounts: [
            {
              ...account,
              status: "error" as const,
              detail:
                "This credential does not match the selected GitHub account. Check Settings → Source Control.",
            },
          ],
          commits: [],
        };
      }
      const avatarUrl = viewer.value.avatar_url?.startsWith("https://")
        ? viewer.value.avatar_url
        : null;
      const commits: GitActivityCommit[] = [];
      let detail: string | null = null;
      let received = 0;
      const query = `author:${viewer.value.login} author-date:${startDate}..${endDate}`;
      // GitHub commit search exposes at most 1,000 results. Never call a capped or interrupted
      // response a complete year; preserve the commits read before a later page failed.
      for (let page = 1; page <= 10; page++) {
        const answer = yield* request({
          operation: "activity.commits",
          resource: "search",
          path: `search/commits?q=${encodeURIComponent(query)}&sort=author-date&order=desc&per_page=100&page=${page}`,
          maxResponseBytes: 4 * 1024 * 1024,
        }).pipe(Effect.result);
        if (Result.isFailure(answer)) {
          detail = answer.failure.message;
          break;
        }
        const decoded = decodePage(answer.success.body);
        if (answer.success.truncated || answer.success.invalidUtf8 || Option.isNone(decoded)) {
          detail = "GitHub returned an unreadable activity page. Refresh to try again.";
          break;
        }
        const data = decoded.value;
        if (data.incomplete_results || data.total_count > 1_000) {
          detail = "GitHub search returned a partial year (up to 1,000 commits per account).";
        }
        received += data.items.length;
        for (const item of data.items) {
          const timestamp = Date.parse(item.commit.author.date);
          if (
            !Number.isFinite(timestamp) ||
            !/^[a-f\d]{7,64}$/i.test(item.sha) ||
            !/^[a-z\d_.-]+\/[a-z\d_.-]+$/i.test(item.repository.full_name)
          ) {
            detail = "Some commits could not be read. The activity shown is partial.";
            continue;
          }
          const authoredAt = DateTime.formatIso(DateTime.makeUnsafe(timestamp));
          if (authoredAt.slice(0, 10) < startDate || authoredAt.slice(0, 10) > endDate) continue;
          commits.push({
            provider: SourceControlProviderKind.make("github"),
            host: target.host,
            accountIds: [account.id],
            repository: item.repository.full_name,
            sha: item.sha,
            message: item.commit.message.split("\n")[0]?.slice(0, 500) || "Untitled commit",
            authoredAt,
            url: `https://${target.host}/${item.repository.full_name}/commit/${item.sha}`,
          });
        }
        if (received >= data.total_count) break;
        if (data.items.length === 0) {
          detail = "GitHub stopped returning commits before the selected period was complete.";
          break;
        }
        if (page === 10) {
          detail = "GitHub search returned a partial year (up to 1,000 commits per account).";
        }
      }
      return {
        accounts: [
          {
            ...account,
            avatarUrl,
            status:
              detail === null
                ? ("connected" as const)
                : received === 0
                  ? ("error" as const)
                  : ("partial" as const),
            detail,
          },
        ],
        commits,
      };
    });
    return yield* read.pipe(
      Effect.catch((error) =>
        Effect.succeed({
          accounts: [{ ...account, status: "error" as const, detail: error.message }],
          commits: [],
        }),
      ),
    );
  });

  return ((input) =>
    Effect.forEach(
      accountTargets(input.auth),
      (target) => readAccount(target, input.startDate, input.endDate),
      { concurrency: 2 },
    ).pipe(
      Effect.map((results): GitActivityProviderResult => ({
        accounts: results.flatMap((result) => result.accounts),
        commits: results.flatMap((result) => result.commits),
      })),
    )) satisfies NonNullable<SourceControlDriverInstance["activity"]>;
});
