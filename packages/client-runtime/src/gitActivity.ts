import type { GitActivityResult } from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";

export interface GitActivityFilters {
  readonly days: number;
  readonly accountId: string;
  readonly provider: string;
  readonly repository: string;
}

export const activityRepositoryKey = (commit: {
  provider: string;
  host: string;
  repository: string;
}) => `${commit.provider}:${commit.host}:${commit.repository}`;

/** Summary, calendar, and history consume this same filtered set of authored commits. */
export function selectGitActivity(result: GitActivityResult, filters: GitActivityFilters) {
  const start = DateTime.subtract(DateTime.makeUnsafe(`${result.endDate}T00:00:00Z`), {
    days: filters.days - 1,
  });
  const startDate = DateTime.formatIsoDateUtc(start);
  const accounts = result.accounts.filter(
    (account) =>
      (filters.accountId === "all" || account.id === filters.accountId) &&
      (filters.provider === "all" || account.provider === filters.provider),
  );
  const commits = result.commits.filter(
    (commit) =>
      commit.authoredAt.slice(0, 10) >= startDate &&
      commit.authoredAt.slice(0, 10) <= result.endDate &&
      (filters.accountId === "all" || commit.accountIds.includes(filters.accountId)) &&
      (filters.provider === "all" || commit.provider === filters.provider) &&
      (filters.repository === "all" || activityRepositoryKey(commit) === filters.repository),
  );
  const counts = new Map<string, number>();
  for (const commit of commits) {
    const day = commit.authoredAt.slice(0, 10);
    counts.set(day, (counts.get(day) ?? 0) + 1);
  }
  const days = Array.from({ length: filters.days }, (_, index) => {
    const date = DateTime.formatIsoDateUtc(DateTime.add(start, { days: index }));
    return { date, count: counts.get(date) ?? 0 };
  });
  return {
    commits,
    days,
    startDate,
    endDate: result.endDate,
    activeRepositories: new Set(commits.map(activityRepositoryKey)).size,
    connectedAccounts: accounts.filter(
      (account) => account.status === "connected" || account.status === "partial",
    ).length,
    isPartial: accounts.some((account) => account.status !== "connected"),
    issues: accounts.filter((account) => account.status !== "connected"),
  };
}
