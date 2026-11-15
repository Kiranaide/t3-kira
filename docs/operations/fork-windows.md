# Personal Windows fork

Use the **T3 Code Fork** shortcut on the desktop or in the Start menu. It launches the
installed custom build with a separate T3 home and Chromium profile. The official T3 Code
shortcut continues to launch the official build.

The fork starts with Daylight Blue. Change it from the palette icon in the chat header or
Settings → Appearance. The split icon opens another chat from the same environment beside
the current one. Dragging a sidebar chat onto the split target does the same thing.

Official automatic updates are disabled in the fork launcher so they cannot replace local
changes. To update the fork, integrate upstream changes into your branch, run the checks,
build a Windows desktop artifact using the repository's packaging tools, close the fork,
and replace only its installation directory. Keep its data and profile directories.

After building a `win-unpacked` desktop artifact, create or refresh the shortcuts with:

```powershell
./scripts/install-fork-windows.ps1 -AppDirectory 'C:/path/to/win-unpacked' -MakeDefault -Launch
```

The installer defaults to `~/.t3-fork` for app data and
`%LOCALAPPDATA%/T3 Code Fork/profile` for Chromium. It creates the initial theme setting
only when settings do not exist, preserving later theme choices. It does not replace the
official install, register a background service, or change the official database.

`-MakeDefault` redirects existing desktop and Start menu shortcuts that point to the official
installation. It saves their originals under `~/.t3-fork/shortcut-backups` and adds a
**T3 Code Official** shortcut as a fallback. Existing pinned taskbar entries may still point
to the official executable; pin **T3 Code Fork** instead.
