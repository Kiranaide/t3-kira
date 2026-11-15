# T3 Kira on Windows

T3 Kira is a personal T3 Code fork with split chats and Daylight Blue. Install it
alongside official T3 Code. Its updater downloads Kira releases from
[Kiranaide/t3-kira](https://github.com/Kiranaide/t3-kira/releases).

## Install

Download the Windows x64 installer from the latest **T3 Kira** nightly release, or
run this command from the fork checkout:

```powershell
./scripts/install-kira-windows.ps1 -Launch
```

To install a downloaded build, pass `-InstallerPath 'C:/path/to/T3-Kira-VERSION-x64.exe'`.

Open **T3 Kira** from the desktop or Start menu. The initial theme is Daylight
Blue. Change it with the palette button beside thread details, or in Settings >
Appearance. The picker shows palette previews and lets you choose light, dark,
or system appearance independently.

Use **Manage agent windows** in the chat header, or drag a sidebar thread onto
the split target, to tile up to four threads. Choose Grid, Columns, or Rows.
Drag a divider to resize windows; a focused divider also accepts arrow keys.
Focus an agent to expand it, then restore the tiled layout. Closing a window
removes it from the workspace and keeps its conversation. Layouts are saved
per main thread. On narrow screens, use the workspace tabs to switch agents.

The installation uses these separate locations:

| Purpose            | Location                          |
| ------------------ | --------------------------------- |
| Application        | `%LOCALAPPDATA%/Programs/t3-kira` |
| App data           | `%USERPROFILE%/.t3-kira/userdata` |
| Browser profile    | `%APPDATA%/t3-kira-v2`            |
| Installer identity | `com.kiranaide.t3kira`            |

Official T3 Code keeps its own installation, shortcuts, data, and update feed.
Kira starts with its own projects and conversations. Provider CLIs can still use
the credentials already configured on this computer.

WSL backends use `~/.t3-kira/userdata` inside the selected Linux distribution,
with a separate runtime cache. Development uses `~/.t3-kira-dev` there.

Kira releases are unsigned. Windows can show a publisher or SmartScreen prompt
on the first installation.

## Receive official nightly changes

The [T3 Kira nightly workflow](https://github.com/Kiranaide/t3-kira/actions/workflows/kira-nightly.yml)
checks for an official nightly every hour and runs when the `kira` branch changes.
GitHub can delay scheduled runs. It merges the released official commit into a
temporary candidate, checks the custom changes, and builds the desktop app and
its WSL runtime from that same candidate. Only successful builds are integrated
into `kira` and published to Kira's update feed.

Keep Kira's update channel on **Nightly**. Use the app's update controls to
download and apply a published Kira build.

A merge conflict, failed check, or failed build stops publication. The installed
app and last successful release remain available. Resolve the failure in the
fork, push the correction, and run the workflow again. The workflow's **force**
option rebuilds the current nightly when a new release is needed.

Each release includes `kira-build.json` with its source commit and official
nightly tag. The `update-feed` release contains the updater's `nightly.json`
pointer. Keep that release public.

## Customize

Keep custom changes on `kira`. Before editing, fetch and fast-forward the latest
verified integration:

```powershell
git switch kira
git pull --ff-only origin kira
```

Edit the layout or features, run focused checks and `vp run check:changed`, then
commit and push to `origin kira`. The workflow builds a new Kira release.

The official remote remains `upstream`. Avoid replacing the customization branch
with `upstream/main`, because that discards the fork's changes. The workflow
imports released nightly commits so Kira follows what official nightly users
actually received.

Scheduled workflows run from the repository's default branch. Set `kira` as the
default branch and enable **T3 Kira nightly** in GitHub Actions. Public forks can
have scheduled workflows disabled after 60 days without repository activity;
re-enable this workflow if GitHub pauses it.

The workflow uses the repository's write-enabled deploy key stored in the
`KIRA_SYNC_SSH_KEY` Actions secret to import upstream workflow changes. Keep that
key limited to this fork and available to the publication job.
