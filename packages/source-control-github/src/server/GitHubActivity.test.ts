import { describe, expect, it } from "@effect/vitest";
import type { SourceControlProviderAuth } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Redacted from "effect/Redacted";

import * as GitHubActivity from "./GitHubActivity.ts";
import * as GitHubCredentials from "./GitHubCredentials.ts";
import * as GitHubRequestPolicy from "./GitHubRequestPolicy.ts";
import * as GitHubRest from "./GitHubRest.ts";

const auth: SourceControlProviderAuth = {
  status: "authenticated",
  host: Option.some("github.com"),
  account: Option.some("personal"),
  detail: Option.none(),
  accounts: ["personal", "work"].map((account) => ({
    host: "github.com",
    account,
    active: account === "personal",
    authenticated: true,
  })),
};
const item = (date = "2026-10-01T12:00:00Z") => ({
  sha: "a".repeat(40),
  repository: { full_name: "team/app" },
  commit: { message: "Improve Start\n\nDetails", author: { date } },
});
const page = (items = [item()], total_count = items.length) => ({
  total_count,
  incomplete_results: false,
  items,
});

function harness(
  answer: (login: string, input: GitHubRest.GitHubRestInput) => unknown,
  viewer?: string,
) {
  const requests: Array<{ login: string; input: GitHubRest.GitHubRestInput }> = [];
  const exact: string[] = [];
  const held = (login: string) => ({
    host: "github.com",
    source: "gh" as const,
    token: Redacted.make(login),
    fingerprint: `test:${login}`,
  });
  const dependencies = Layer.mergeAll(
    Layer.mock(GitHubCredentials.GitHubCredentials)({
      getForAccount: (_host, login) =>
        Effect.sync(() => {
          exact.push(login);
          return held(login);
        }),
    }),
    Layer.mock(GitHubRest.GitHubRest)({
      credential: () => Effect.succeed(held("personal")),
      rest: (input) =>
        Effect.gen(function* () {
          const pinned = yield* GitHubRequestPolicy.PinnedGitHubCredential;
          const login = pinned === null ? "un-pinned" : Redacted.value(pinned.token);
          requests.push({ login, input });
          const body = input.path === "user" ? { login: viewer ?? login } : answer(login, input);
          if (body === "fail")
            return yield* new GitHubRequestPolicy.GitHubApiRequestError({
              host: input.host,
              operation: input.operation,
              cause: "offline",
            });
          return {
            status: 200,
            headers: {},
            body: typeof body === "string" ? body : JSON.stringify(body),
            truncated: false,
            invalidUtf8: false,
          };
        }),
    }),
  );
  return { dependencies, requests, exact };
}

describe("GitHub activity", () => {
  it.effect("pins each login, uses search quota, and normalizes author days to UTC", () => {
    const test = harness(() => page([item("2026-10-01T00:30:00+02:00")]));
    return Effect.gen(function* () {
      const read = yield* GitHubActivity.make;
      const result = yield* read({ auth, startDate: "2026-09-01", endDate: "2026-10-31" });
      expect(test.exact).toEqual(["work"]);
      expect(result.accounts.map((account) => account.status)).toEqual(["connected", "connected"]);
      expect(result.commits.map((commit) => commit.accountIds)).toEqual([
        ["github:github.com:personal"],
        ["github:github.com:work"],
      ]);
      expect(result.commits[0]?.authoredAt).toBe("2026-09-30T22:30:00.000Z");
      expect(result.commits[0]?.message).toBe("Improve Start");
      for (const { login, input } of test.requests.filter(
        (request) => request.input.path !== "user",
      )) {
        expect(input.resource).toBe("search");
        expect(input.allowReserve).toBe(false);
        expect(decodeURIComponent(input.path)).toContain(
          `author:${login} author-date:2026-09-01..2026-10-31`,
        );
      }
    }).pipe(Effect.provide(test.dependencies));
  });

  it.effect("refuses mismatched identities before searching", () => {
    const test = harness(() => page(), "someone-else");
    return Effect.gen(function* () {
      const read = yield* GitHubActivity.make;
      const result = yield* read({ auth, startDate: "2026-09-01", endDate: "2026-10-31" });
      expect(result.accounts.every((account) => account.status === "error")).toBe(true);
      expect(result.commits).toEqual([]);
      expect(test.requests.every((request) => request.input.path === "user")).toBe(true);
    }).pipe(Effect.provide(test.dependencies));
  });

  it.effect.each(["failed-page", "invalid-page", "capped", "incomplete", "page-limit"])(
    "keeps a partial result for %s",
    (reason) => {
      const test = harness((_login, input) => {
        if (reason === "failed-page" || reason === "invalid-page") {
          return input.path.endsWith("page=1")
            ? page([item()], 2)
            : reason === "failed-page"
              ? "fail"
              : "not json";
        }
        return reason === "capped" || reason === "page-limit"
          ? page([item()], reason === "capped" ? 1_001 : 20)
          : { ...page(), incomplete_results: true };
      });
      return Effect.gen(function* () {
        const read = yield* GitHubActivity.make;
        const result = yield* read({ auth, startDate: "2026-09-01", endDate: "2026-10-31" });
        expect(result.accounts.every((account) => account.status === "partial")).toBe(true);
        expect(result.commits.length).toBeGreaterThan(0);
        expect(
          test.requests.filter(
            (request) => request.login === "work" && request.input.path !== "user",
          ).length,
        ).toBeLessThanOrEqual(10);
      }).pipe(Effect.provide(test.dependencies));
    },
  );
});
