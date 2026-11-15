import { describe, expect, it } from "@effect/vitest";
import {
  SourceControlProviderKind,
  type GitActivityCommit,
  type GitActivityResult,
} from "@t3tools/contracts";
import { activityRepositoryKey, selectGitActivity } from "./gitActivity.ts";

const github = SourceControlProviderKind.make("github");
const base: GitActivityCommit = {
  provider: github,
  host: "github.com",
  accountIds: ["personal", "work"],
  repository: "team/app",
  sha: "a",
  message: "Change",
  authoredAt: "2026-11-15T00:00:00.000Z",
  url: "https://github.com/team/app/commit/a",
};
const result: GitActivityResult = {
  startDate: "2025-11-16",
  endDate: "2026-11-15",
  fetchedAt: "2026-11-15T12:00:00Z",
  accounts: ["personal", "work"].map((id) => ({
    id,
    provider: github,
    host: "github.com",
    login: id,
    avatarUrl: null,
    status: "connected",
    detail: null,
  })),
  commits: [
    base,
    {
      ...base,
      sha: "b",
      accountIds: ["work"],
      repository: "team/other",
      authoredAt: "2026-11-09T23:59:59.000Z",
    },
    { ...base, sha: "c", authoredAt: "2026-11-08T23:59:59.000Z" },
  ],
};

describe("Git activity filters", () => {
  it("keeps calendar and summary on the same account, repository, and UTC date range", () => {
    const view = selectGitActivity(result, {
      days: 7,
      accountId: "work",
      provider: "all",
      repository: "all",
    });
    expect(view.startDate).toBe("2026-11-09");
    expect(view.commits).toHaveLength(2);
    expect(view.days).toHaveLength(7);
    expect(view.days.reduce((sum, day) => sum + day.count, 0)).toBe(2);
    expect(view.activeRepositories).toBe(2);
    expect(view.connectedAccounts).toBe(1);
    const repository = selectGitActivity(result, {
      days: 7,
      accountId: "personal",
      provider: "github",
      repository: activityRepositoryKey(base),
    });
    expect(repository.commits).toEqual([base]);
    expect(repository.days.at(-1)?.count).toBe(1);
    expect(
      selectGitActivity(result, {
        days: 7,
        accountId: "all",
        provider: "gitlab",
        repository: "all",
      }).commits,
    ).toEqual([]);
  });

  it("reports unavailable accounts and incomplete years without counting them as complete", () => {
    const partial = {
      ...result,
      accounts: result.accounts.map((account) => ({
        ...account,
        status: account.id === "personal" ? ("partial" as const) : ("error" as const),
        detail: "Partial",
      })),
    };
    const view = selectGitActivity(partial, {
      days: 365,
      accountId: "all",
      provider: "all",
      repository: "all",
    });
    expect(view.days[0]?.date).toBe("2025-11-16");
    expect(view.connectedAccounts).toBe(1);
    expect(view.isPartial).toBe(true);
    expect(view.issues).toHaveLength(2);
  });
});
