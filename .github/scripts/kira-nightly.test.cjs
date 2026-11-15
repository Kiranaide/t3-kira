const assert = require("node:assert/strict");
const { test } = require("node:test");
const { latestKiraRelease, parseNightlyVersion, planKiraRelease } = require("./kira-nightly.cjs");

const tag = "v0.1.10-nightly.20261115.4723";
const lastRelease = {
  name: "T3 Kira v0.1.10-nightly.20261115.12",
  tag_name: "v0.1.10-nightly.20261115.12",
  target_commitish: "custom-head",
  draft: false,
};
const input = {
  upstreamTag: tag,
  headSha: "custom-head",
  upstreamMerged: true,
  lastRelease,
  date: "20261115",
  runNumber: 13,
  force: false,
};

test("skips only a published build containing both the custom head and the official nightly", () => {
  assert.deepEqual(planKiraRelease(input), { build: false, tag: lastRelease.tag_name });
  for (const changed of [
    { upstreamMerged: false },
    { headSha: "new-custom-feature" },
    { lastRelease: undefined },
    { force: true },
  ]) {
    assert.equal(planKiraRelease({ ...input, ...changed }).build, true);
  }
});

test("versions follow the official train and increase across retries and clock changes", () => {
  for (const [changed, expected] of [
    [{}, "0.1.10-nightly.20261115.13"],
    [{ runNumber: 1 }, "0.1.10-nightly.20261115.13"],
    [{ date: "20261114", runNumber: 1 }, "0.1.10-nightly.20261115.13"],
    [{ date: "20261116", runNumber: 1 }, "0.1.10-nightly.20261116.1"],
    [{ upstreamTag: "v0.1.11-nightly.20261115.1", runNumber: 1 }, "0.1.11-nightly.20261115.1"],
  ]) {
    assert.equal(planKiraRelease({ ...input, force: true, ...changed }).version, expected);
  }
});

test("rejects unsupported upstream versions and release downgrades", () => {
  for (const upstreamTag of [
    "v0.1.10",
    "v0.1.10-preview.20261115.1",
    "v0.1.10-nightly.20261115.1;echo unsafe",
  ]) {
    assert.throws(() => planKiraRelease({ ...input, upstreamTag }), /Unsupported nightly/);
  }
  assert.throws(
    () => planKiraRelease({ ...input, upstreamTag: "v0.1.9-nightly.20261115.1" }),
    /older than.*Kira release train/,
  );
  for (const runNumber of [0, -1, NaN, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(
      () => planKiraRelease({ ...input, force: true, runNumber }),
      /positive workflow run number/,
    );
  }
  assert.throws(
    () => parseNightlyVersion("v0.1.10-nightly.20261115.99999999999999999"),
    /numeric range/,
  );
});

test("drafts and unrelated releases cannot suppress a retry or become Kira's update target", () => {
  const older = { ...lastRelease, tag_name: "v0.1.10-nightly.20261114.99" };
  const newer = { ...lastRelease, tag_name: "v0.1.10-nightly.20261116.1" };
  assert.equal(
    latestKiraRelease([
      { ...newer, tag_name: "v0.1.10-nightly.20261117.1", draft: true },
      {
        ...newer,
        name: "T3 Code v0.1.10-nightly.20261118.1",
        tag_name: "v0.1.10-nightly.20261118.1",
      },
      { name: "Update feed", tag_name: "update-feed", draft: false },
      older,
      newer,
      lastRelease,
    ]),
    newer,
  );
  assert.equal(latestKiraRelease([{ ...lastRelease, draft: true }]), undefined);
});
