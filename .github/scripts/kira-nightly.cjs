const { execFileSync, spawnSync } = require("node:child_process");
const path = require("node:path");
const { resolveLatestNightlyCommit } = require("./check-nightly-release.cjs");

const UPSTREAM = { owner: "pingdotgg", repo: "t3code" };
const NIGHTLY_VERSION = /^v?(\d+)\.(\d+)\.(\d+)-nightly\.(\d{8})\.(\d+)$/;

function parseNightlyVersion(version) {
  const match = NIGHTLY_VERSION.exec(version);
  if (!match) throw new Error(`Unsupported nightly version: ${version}`);
  const parts = match.slice(1).map(Number);
  if (parts.some((part) => !Number.isSafeInteger(part))) {
    throw new Error(`Nightly version exceeds the supported numeric range: ${version}`);
  }
  return parts;
}

function compareVersions(left, right) {
  for (let index = 0; index < left.length; index++) {
    if (left[index] !== right[index]) return left[index] > right[index] ? 1 : -1;
  }
  return 0;
}

function latestKiraRelease(releases) {
  return releases
    .filter(
      (release) =>
        !release.draft &&
        release.name?.startsWith("T3 Kira v") &&
        NIGHTLY_VERSION.test(release.tag_name),
    )
    .reduce(
      (latest, release) =>
        !latest ||
        compareVersions(
          parseNightlyVersion(release.tag_name),
          parseNightlyVersion(latest.tag_name),
        ) > 0
          ? release
          : latest,
      undefined,
    );
}

function planKiraRelease({
  upstreamTag,
  headSha,
  upstreamMerged,
  lastRelease,
  date,
  runNumber,
  force,
}) {
  const upstream = parseNightlyVersion(upstreamTag);
  const previous = lastRelease ? parseNightlyVersion(lastRelease.tag_name) : undefined;
  if (previous && compareVersions(upstream.slice(0, 3), previous.slice(0, 3)) < 0) {
    throw new Error("The official nightly is older than the installed Kira release train.");
  }
  if (!force && upstreamMerged && lastRelease?.target_commitish === headSha) {
    return { build: false, tag: lastRelease.tag_name };
  }
  if (!/^\d{8}$/.test(date) || !Number.isSafeInteger(runNumber) || runNumber < 1) {
    throw new Error("A build needs a UTC date and a positive workflow run number.");
  }
  const sameTrain = previous && compareVersions(upstream.slice(0, 3), previous.slice(0, 3)) === 0;
  const buildDate = Math.max(Number(date), upstream[3], sameTrain ? previous[3] : 0);
  const revision = Math.max(
    runNumber,
    sameTrain && previous[3] === buildDate ? previous[4] + 1 : 1,
  );
  if (!Number.isSafeInteger(revision)) throw new Error("The Kira build number is exhausted.");
  const version = `${upstream.slice(0, 3).join(".")}-nightly.${buildDate}.${revision}`;
  return { build: true, version, tag: `v${version}` };
}

async function prepareKiraNightly({ github, context, core }) {
  if (
    `${context.repo.owner}/${context.repo.repo}` !== "Kiranaide/t3-kira" ||
    context.ref !== "refs/heads/kira"
  ) {
    throw new Error("T3 Kira releases run only from Kiranaide/t3-kira's kira branch.");
  }
  const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();
  const upstream = await resolveLatestNightlyCommit({ github, context: { repo: UPSTREAM }, core });
  parseNightlyVersion(upstream.tag);
  git("fetch", "--no-tags", "https://github.com/pingdotgg/t3code.git", `refs/tags/${upstream.tag}`);
  if (git("rev-parse", "FETCH_HEAD^{commit}") !== upstream.sha) {
    throw new Error("The fetched official tag does not match its resolved commit.");
  }
  const ancestry = spawnSync("git", ["merge-base", "--is-ancestor", upstream.sha, "HEAD"]);
  if (ancestry.error || ![0, 1].includes(ancestry.status)) {
    throw new Error("Could not establish the official nightly's ancestry.", {
      cause: ancestry.error,
    });
  }
  const releases = await github.paginate(github.rest.repos.listReleases, {
    ...context.repo,
    per_page: 100,
  });
  const plan = planKiraRelease({
    upstreamTag: upstream.tag,
    headSha: git("rev-parse", "HEAD"),
    upstreamMerged: ancestry.status === 0,
    lastRelease: latestKiraRelease(releases),
    date: new Date().toISOString().slice(0, 10).replaceAll("-", ""),
    runNumber: Number(process.env.GITHUB_RUN_NUMBER),
    force: process.env.KIRA_FORCE === "true",
  });
  for (const [name, value] of Object.entries(plan)) core.setOutput(name, value);
  core.setOutput("upstream_tag", upstream.tag);
  core.setOutput("upstream_sha", upstream.sha);
  if (!plan.build) {
    core.info(`${plan.tag} already contains the current customizations and official nightly.`);
    return;
  }
  git("config", "user.name", "github-actions[bot]");
  git("config", "user.email", "41898282+github-actions[bot]@users.noreply.github.com");
  git("merge", "--no-ff", "--no-edit", upstream.sha);
  core.setOutput("source_sha", git("rev-parse", "HEAD"));
  git("branch", "kira-candidate", "HEAD");
  // Include the tip even when this run only rebuilds an already-merged nightly.
  git(
    "bundle",
    "create",
    path.join(process.env.RUNNER_TEMP, "kira-candidate.bundle"),
    "kira-candidate",
    "^HEAD~1",
  );
}

module.exports = { latestKiraRelease, parseNightlyVersion, planKiraRelease, prepareKiraNightly };
