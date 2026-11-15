import { useId, useState, type CSSProperties, type KeyboardEvent } from "react";
import { Link } from "@tanstack/react-router";
import {
  AuthOrchestrationReadScope,
  type EnvironmentId,
  type GitActivityResult,
} from "@t3tools/contracts";
import {
  activityRepositoryKey,
  selectGitActivity,
} from "@t3tools/client-runtime/state/source-control";
import {
  ChevronDownIcon,
  ChevronUpIcon,
  GitCommitHorizontalIcon,
  ImageIcon,
  RefreshCwIcon,
} from "lucide-react";

import { cn } from "../../lib/utils";
import { readLocalApi } from "../../localApi";
import { useEnvironmentQuery } from "../../state/query";
import { useEnvironmentScope } from "../../state/session";
import { sourceControlEnvironment } from "../../state/sourceControl";
import { useAtomCommand } from "../../state/use-atom-command";
import { BackgroundSettings } from "../settings/BackgroundSettings";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
  DialogTrigger,
} from "../ui/dialog";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";

const PERIODS = [365, 90, 30, 7] as const;
const dateLabel = (date: string) =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });

function ActivitySelect({
  label,
  value,
  options,
  onChange,
}: {
  readonly label: string;
  readonly value: string;
  readonly options: readonly { readonly value: string; readonly label: string }[];
  readonly onChange: (value: string) => void;
}) {
  return (
    <Select
      value={value}
      onValueChange={(next) => {
        if (next !== null) onChange(next);
      }}
    >
      <SelectTrigger size="compact" variant="ghost" aria-label={label} className="max-w-44">
        <SelectValue>
          {options.find((option) => option.value === value)?.label ?? label}
        </SelectValue>
      </SelectTrigger>
      <SelectPopup>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectPopup>
    </Select>
  );
}

function BackgroundButton() {
  return (
    <Dialog>
      <DialogTrigger
        render={<Button variant="ghost" size="icon-xs" aria-label="Customize backgrounds" />}
      >
        <ImageIcon />
      </DialogTrigger>
      <DialogPopup>
        <DialogHeader>
          <DialogTitle>Chat & Start backgrounds</DialogTitle>
        </DialogHeader>
        <DialogPanel>
          <BackgroundSettings />
        </DialogPanel>
      </DialogPopup>
    </Dialog>
  );
}

function ContributionCalendar({
  days,
  selectedDay,
  onSelect,
  onInspect,
}: {
  readonly days: readonly { readonly date: string; readonly count: number }[];
  readonly selectedDay: string | null;
  readonly onSelect: (day: string | null) => void;
  readonly onInspect: (day: string | null) => void;
}) {
  const [focusedDay, setFocusedDay] = useState<string | null>(null);
  const tabDay = days.some((day) => day.date === focusedDay) ? focusedDay : days.at(-1)?.date;
  const navigate = (event: KeyboardEvent<HTMLDivElement>) => {
    const steps: Record<string, number> = {
      ArrowUp: -1,
      ArrowDown: 1,
      ArrowLeft: -7,
      ArrowRight: 7,
    };
    const step = steps[event.key];
    if (step === undefined) return;
    const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("button")];
    const index = buttons.indexOf(event.target as HTMLButtonElement);
    if (index < 0) return;
    event.preventDefault();
    buttons[Math.max(0, Math.min(buttons.length - 1, index + step))]?.focus();
  };
  const offset = days[0] === undefined ? 0 : new Date(`${days[0].date}T00:00:00Z`).getUTCDay();
  const cells = [
    ...Array.from({ length: offset }, (_, index) => ({
      date: new Date(Date.parse(`${days[0]?.date}T00:00:00Z`) - (offset - index) * 86_400_000)
        .toISOString()
        .slice(0, 10),
      count: null,
    })),
    ...days,
  ];
  const weeks = Math.ceil(cells.length / 7);
  const months = Array.from({ length: weeks }, (_, week) => {
    const first = cells.slice(week * 7, week * 7 + 7).find((day) => day.count !== null);
    const previous =
      week === 0
        ? undefined
        : cells.slice((week - 1) * 7, week * 7).find((day) => day.count !== null);
    return {
      key: first?.date ?? "empty",
      label:
        first !== undefined &&
        (previous === undefined || first.date.slice(0, 7) !== previous.date.slice(0, 7))
          ? new Date(`${first.date}T00:00:00Z`).toLocaleDateString(undefined, {
              month: "short",
              timeZone: "UTC",
            })
          : "",
    };
  });
  return (
    <div
      className="overflow-x-auto pb-1"
      aria-label="Contribution calendar in UTC"
      onPointerLeave={() => onInspect(null)}
    >
      <div className="git-activity-calendar" style={{ "--activity-weeks": weeks } as CSSProperties}>
        <div className="git-activity-months" aria-hidden>
          {months.map((month) => (
            <span key={month.key}>{month.label}</span>
          ))}
        </div>
        <div className="git-activity-weekdays" aria-hidden>
          <span>Mon</span>
          <span>Wed</span>
          <span>Fri</span>
        </div>
        <div
          className="git-activity-days"
          role="group"
          aria-label="Daily commits. Use arrow keys to move between days."
          onKeyDown={navigate}
        >
          {cells.map((day) =>
            day.count === null ? (
              <span key={day.date} />
            ) : (
              <button
                key={day.date}
                type="button"
                className={cn(
                  "git-activity-day",
                  selectedDay === day.date && "git-activity-day-selected",
                )}
                data-level={
                  day.count === 0
                    ? 0
                    : day.count < 3
                      ? 1
                      : day.count < 6
                        ? 2
                        : day.count < 10
                          ? 3
                          : 4
                }
                aria-label={`${day.date}: ${day.count} ${day.count === 1 ? "commit" : "commits"} (UTC)`}
                aria-pressed={selectedDay === day.date}
                tabIndex={day.date === tabDay ? 0 : -1}
                onFocus={() => {
                  setFocusedDay(day.date);
                  onInspect(day.date);
                }}
                onPointerEnter={() => onInspect(day.date)}
                onClick={() => onSelect(selectedDay === day.date ? null : day.date)}
              />
            ),
          )}
        </div>
      </div>
    </div>
  );
}

function GitActivityContent({ result }: { readonly result: GitActivityResult }) {
  const historyId = useId();
  const [days, setDays] = useState<number>(365);
  const [selectedAccountId, setAccountId] = useState("all");
  const [selectedProvider, setProvider] = useState("all");
  const [selectedRepository, setRepository] = useState("all");
  const [expanded, setExpanded] = useState(false);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [inspectedDate, setInspectedDate] = useState<string | null>(null);
  const [historyLimit, setHistoryLimit] = useState(10);
  const repositories = [
    ...new Map(
      result.commits.map((commit) => [
        activityRepositoryKey(commit),
        `${commit.repository}${commit.host === "github.com" ? "" : ` · ${commit.host}`}`,
      ]),
    ).entries(),
  ];
  const providers = [...new Set(result.accounts.map((account) => account.provider))];
  const provider = providers.some((value) => value === selectedProvider) ? selectedProvider : "all";
  const accountId = result.accounts.some((account) => account.id === selectedAccountId)
    ? selectedAccountId
    : "all";
  const repository = repositories.some(([value]) => value === selectedRepository)
    ? selectedRepository
    : "all";
  const view = selectGitActivity(result, { days, accountId, provider, repository });
  const inspectedDay = view.days.find((day) => day.date === inspectedDate);
  const history =
    selectedDay === null
      ? view.commits
      : view.commits.filter((commit) => commit.authoredAt.slice(0, 10) === selectedDay);
  const hasData = view.connectedAccounts > 0;
  const chooseDay = (day: string | null) => {
    setSelectedDay(day);
    setHistoryLimit(10);
    if (day !== null) setExpanded(true);
  };
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
        <div className="flex min-w-0 flex-wrap items-center gap-1">
          <ActivitySelect
            label="Git account"
            value={accountId}
            options={[
              { value: "all", label: "All accounts" },
              ...result.accounts.map((account) => ({
                value: account.id,
                label: `@${account.login}${account.host === "github.com" ? "" : ` · ${account.host}`}`,
              })),
            ]}
            onChange={(next) => {
              setAccountId(next);
              setRepository("all");
              setSelectedDay(null);
              setHistoryLimit(10);
            }}
          />
          <ActivitySelect
            label="Activity date range"
            value={String(days)}
            options={PERIODS.map((period) => ({
              value: String(period),
              label: `Last ${period} days`,
            }))}
            onChange={(next) => {
              setDays(Number(next));
              setSelectedDay(null);
              setHistoryLimit(10);
            }}
          />
        </div>
        <Button
          variant="ghost"
          size="compact"
          aria-expanded={expanded}
          aria-controls={historyId}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? <ChevronUpIcon /> : <ChevronDownIcon />}History
        </Button>
      </div>
      <dl className="grid grid-cols-3 gap-3 py-2.5">
        {[
          {
            label: "Commits",
            value: hasData
              ? `${view.isPartial ? "≥" : ""}${view.commits.length.toLocaleString()}`
              : "n/a",
          },
          {
            label: "Repositories",
            value: hasData ? `${view.isPartial ? "≥" : ""}${view.activeRepositories}` : "n/a",
          },
          { label: "Accounts", value: view.connectedAccounts },
        ].map((stat) => (
          <div key={stat.label}>
            <dd className="text-lg font-semibold leading-tight tabular-nums text-foreground">
              {stat.value}
            </dd>
            <dt className="text-2xs text-muted-foreground">{stat.label}</dt>
          </div>
        ))}
      </dl>
      <ContributionCalendar
        days={view.days}
        selectedDay={selectedDay}
        onSelect={chooseDay}
        onInspect={setInspectedDate}
      />
      <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-2xs text-muted-foreground">
        <output>
          {inspectedDay === undefined ? (
            <>
              {dateLabel(view.startDate)}, {view.startDate.slice(0, 4)} – {dateLabel(view.endDate)},{" "}
              {view.endDate.slice(0, 4)} · UTC
            </>
          ) : (
            <>
              {dateLabel(inspectedDay.date)}, {inspectedDay.date.slice(0, 4)} · {inspectedDay.count}{" "}
              {inspectedDay.count === 1 ? "commit" : "commits"} · UTC
            </>
          )}
        </output>
        <div className="flex items-center gap-1.5" aria-hidden>
          <span>Less</span>
          {[0, 1, 2, 3, 4].map((level) => (
            <span key={level} className="git-activity-day" data-level={level} />
          ))}
          <span>More</span>
        </div>
      </div>
      {view.issues.length > 0 ? (
        <p className="pt-2 text-2xs text-warning">
          {hasData ? "Partial activity." : "Activity unavailable."}{" "}
          {view.issues
            .map((account) => `@${account.login}: ${account.detail ?? account.status}`)
            .join(" ")}
        </p>
      ) : null}
      {expanded ? (
        <div id={historyId} className="mt-3 border-t border-border/60 pt-3">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-2">
            <div className="flex min-w-0 flex-wrap items-center gap-1">
              <ActivitySelect
                label="Git provider"
                value={provider}
                options={[
                  { value: "all", label: "All providers" },
                  ...providers.map((value) => ({
                    value,
                    label: value === "github" ? "GitHub" : value,
                  })),
                ]}
                onChange={(next) => {
                  setProvider(next);
                  setAccountId("all");
                  setRepository("all");
                  setSelectedDay(null);
                  setHistoryLimit(10);
                }}
              />
              <ActivitySelect
                label="Git repository"
                value={repository}
                options={[
                  { value: "all", label: "All repositories" },
                  ...repositories.map(([value, label]) => ({ value, label })),
                ]}
                onChange={(next) => {
                  setRepository(next);
                  setSelectedDay(null);
                  setHistoryLimit(10);
                }}
              />
            </div>
            {selectedDay !== null ? (
              <Button size="compact" variant="ghost" onClick={() => chooseDay(null)}>
                {dateLabel(selectedDay)} · Clear
              </Button>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-2 pb-3">
            {result.accounts.map((account) => (
              <span
                key={account.id}
                className="inline-flex min-w-0 items-center gap-1.5 text-2xs text-muted-foreground"
              >
                {account.avatarUrl === null ? null : (
                  <img src={account.avatarUrl} alt="" className="size-4 rounded-full" />
                )}
                <span className="max-w-36 truncate">
                  {account.provider === "github" ? "GitHub" : account.provider} · @{account.login}
                </span>
                <span
                  className={cn(
                    "size-1.5 shrink-0 rounded-full",
                    account.status === "connected" ? "bg-success" : "bg-warning",
                  )}
                  role="img"
                  aria-label={account.status}
                />
              </span>
            ))}
          </div>
          {history.length === 0 ? (
            <p className="py-4 text-center text-xs text-muted-foreground">
              {hasData
                ? "No authored commits in this selection."
                : "Connect a GitHub account to see its activity."}
            </p>
          ) : (
            <ol className="divide-y divide-border/40">
              {history.slice(0, historyLimit).map((commit) => (
                <li
                  key={`${activityRepositoryKey(commit)}:${commit.sha}`}
                  className="flex min-w-0 items-start gap-2 py-2"
                >
                  <GitCommitHorizontalIcon
                    className="mt-0.5 size-3.5 shrink-0 text-primary"
                    aria-hidden
                  />
                  <a
                    href={commit.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="min-w-0 flex-1 rounded-sm focus-visible:outline-2 focus-visible:outline-ring"
                    onClick={(event) => {
                      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                      event.preventDefault();
                      void readLocalApi()?.shell.openExternal(commit.url);
                    }}
                  >
                    <p className="truncate text-xs text-foreground hover:underline">
                      {commit.message}
                    </p>
                    <p className="truncate pt-0.5 text-2xs text-muted-foreground">
                      {commit.repository} ·{" "}
                      {commit.provider === "github" ? "GitHub" : commit.provider} ·{" "}
                      {commit.accountIds
                        .map(
                          (id) =>
                            `@${result.accounts.find((account) => account.id === id)?.login ?? id}`,
                        )
                        .join(", ")}
                    </p>
                  </a>
                  <time
                    dateTime={commit.authoredAt}
                    className="shrink-0 pt-0.5 text-2xs tabular-nums text-muted-foreground"
                    aria-label={`${commit.authoredAt} · UTC`}
                  >
                    {new Date(commit.authoredAt).toLocaleString(undefined, {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                      timeZone: "UTC",
                    })}
                  </time>
                </li>
              ))}
            </ol>
          )}
          {history.length > historyLimit ? (
            <div className="flex justify-center pt-2">
              <Button
                size="compact"
                variant="ghost"
                onClick={() => setHistoryLimit(historyLimit + 20)}
              >
                Show more commits
              </Button>
            </div>
          ) : null}
          <p className="pt-3 text-2xs text-muted-foreground">
            Authored commits visible to your accounts through GitHub search. Updated{" "}
            {new Date(result.fetchedAt).toLocaleTimeString(undefined, {
              hour: "2-digit",
              minute: "2-digit",
            })}
            .{" "}
            <Link className="underline underline-offset-2" to="/settings/source-control">
              Manage accounts
            </Link>
          </p>
        </div>
      ) : null}
    </>
  );
}

export function GitActivityPanel({
  environmentId,
}: {
  readonly environmentId: EnvironmentId | null;
}) {
  const canRead = useEnvironmentScope(environmentId, AuthOrchestrationReadScope);
  const query = useEnvironmentQuery(
    environmentId !== null && canRead
      ? sourceControlEnvironment.activity({ environmentId, input: {} })
      : null,
  );
  const refreshActivity = useAtomCommand(sourceControlEnvironment.refreshActivity, {
    reportFailure: false,
  });
  const [refreshing, setRefreshing] = useState(false);
  const refresh = async () => {
    if (environmentId === null) return;
    setRefreshing(true);
    await refreshActivity({ environmentId, input: { refresh: true } });
    query.refresh();
    setRefreshing(false);
  };
  return (
    <section aria-label="Git activity" className="git-activity-panel">
      <div className="flex items-center justify-between gap-3 pb-1">
        <div className="flex min-w-0 items-center gap-2">
          <GitCommitHorizontalIcon className="size-4 text-primary" aria-hidden />
          <h2 className="text-xs font-medium text-foreground">Git activity</h2>
          <span className="hidden text-2xs text-muted-foreground sm:inline">Welcome back</span>
        </div>
        <div className="flex items-center gap-0.5">
          <BackgroundButton />
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Refresh Git activity"
            disabled={!canRead || refreshing || query.isPending}
            onClick={refresh}
          >
            <RefreshCwIcon />
          </Button>
        </div>
      </div>
      {query.error !== null ? (
        <p role="status" className="py-2 text-xs text-warning">
          Could not load Git activity. {query.error}
        </p>
      ) : null}
      {query.data !== null && query.data.accounts.length > 0 ? (
        <GitActivityContent key={environmentId} result={query.data} />
      ) : (
        <div
          className="flex flex-wrap items-center justify-between gap-3 py-4 text-xs text-muted-foreground"
          role="status"
        >
          <span>
            {query.isPending || refreshing
              ? "Loading Git activity…"
              : "Connect GitHub accounts to see your commits here."}
          </span>
          <Button size="compact" variant="outline" render={<Link to="/settings/source-control" />}>
            Connect accounts
          </Button>
        </div>
      )}
    </section>
  );
}
