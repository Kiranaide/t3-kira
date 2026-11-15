param(
  [Parameter(Mandatory = $true)][string]$AppDirectory,
  [string]$ForkHome = (Join-Path $env:USERPROFILE '.t3-fork'),
  [string]$ProfileDirectory = (Join-Path $env:LOCALAPPDATA 'T3 Code Fork/profile'),
  [switch]$Launch,
  [switch]$MakeDefault
)

$ErrorActionPreference = 'Stop'
$appRoot = (Resolve-Path -LiteralPath $AppDirectory).Path
$executables = @(Get-ChildItem -LiteralPath $appRoot -File -Filter '*.exe' | Where-Object Name -Like 'T3 Code*')
if ($executables.Count -ne 1) {
  throw 'Pass the win-unpacked directory containing the built T3 Code executable.'
}
$forkRoot = [IO.Path]::GetFullPath($ForkHome)
$profileRoot = [IO.Path]::GetFullPath($ProfileDirectory)
$officialHome = [IO.Path]::GetFullPath((Join-Path $env:USERPROFILE '.t3'))
if ($forkRoot.TrimEnd('\') -eq $officialHome.TrimEnd('\')) {
  throw 'The fork must use its own T3 home.'
}
New-Item -ItemType Directory -Path $forkRoot, $profileRoot -Force | Out-Null
$settingsDirectory = Join-Path $forkRoot 'userdata'
New-Item -ItemType Directory -Path $settingsDirectory -Force | Out-Null
$settingsPath = Join-Path $settingsDirectory 'settings.json'
if (!(Test-Path -LiteralPath $settingsPath)) {
  $settingsJson = @{ defaultTheme = 'daylight-blue'; defaultThemeSetAt = [DateTime]::UtcNow.ToString('o') } | ConvertTo-Json
  [IO.File]::WriteAllText($settingsPath, $settingsJson, (New-Object Text.UTF8Encoding($false)))
}

$executableLiteral = $executables[0].FullName.Replace("'", "''")
$forkLiteral = $forkRoot.Replace("'", "''")
$profileLiteral = $profileRoot.Replace("'", "''")
$launcherPath = Join-Path $forkRoot 'Launch T3 Code Fork.ps1'
@"
`$ErrorActionPreference = 'Stop'
`$env:T3CODE_HOME = '$forkLiteral'
`$env:T3CODE_DESKTOP_USER_DATA_DIR = '$profileLiteral'
`$env:T3CODE_DESKTOP_APP_USER_MODEL_ID = 'com.kiranaide.t3code.fork'
`$env:T3CODE_DISABLE_AUTO_UPDATE = 'true'
Remove-Item Env:VITE_DEV_SERVER_URL -ErrorAction SilentlyContinue
Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
Start-Process -FilePath '$executableLiteral' -WindowStyle Hidden
"@ | Set-Content -LiteralPath $launcherPath -Encoding UTF8

$shell = New-Object -ComObject WScript.Shell
$shortcutDirectories = @(
  [Environment]::GetFolderPath('Desktop'),
  (Join-Path ([Environment]::GetFolderPath('StartMenu')) 'Programs')
)
foreach ($directory in $shortcutDirectories) {
  New-Item -ItemType Directory -Path $directory -Force | Out-Null
  $shortcut = $shell.CreateShortcut((Join-Path $directory 'T3 Code Fork.lnk'))
  $shortcut.TargetPath = Join-Path $PSHOME 'powershell.exe'
  $shortcut.Arguments = '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $launcherPath + '"'
  $shortcut.WorkingDirectory = $appRoot
  $shortcut.IconLocation = $executables[0].FullName + ',0'
  $shortcut.Description = 'Your custom T3 Code fork with split chats and Daylight Blue'
  $shortcut.WindowStyle = 7
  $shortcut.Save()
  if ($MakeDefault) {
    $officialInstall = [IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA 'Programs/t3code')).TrimEnd('\') + '\'
    foreach ($name in @('T3 Code.lnk', 'T3 Code (Nightly).lnk', 'T3 Code (Beta).lnk')) {
      $existingPath = Join-Path $directory $name
      if (!(Test-Path -LiteralPath $existingPath)) { continue }
      $existing = $shell.CreateShortcut($existingPath)
      if (!$existing.TargetPath.StartsWith($officialInstall, [StringComparison]::OrdinalIgnoreCase)) { continue }
      $backupDirectory = Join-Path (Join-Path $forkRoot 'shortcut-backups') ([IO.Path]::GetFileName($directory))
      New-Item -ItemType Directory -Path $backupDirectory -Force | Out-Null
      $backupPath = Join-Path $backupDirectory $name
      if (!(Test-Path -LiteralPath $backupPath)) { Copy-Item -LiteralPath $existingPath -Destination $backupPath }
      $officialShortcut = Join-Path $directory 'T3 Code Official.lnk'
      if (!(Test-Path -LiteralPath $officialShortcut)) { Copy-Item -LiteralPath $backupPath -Destination $officialShortcut }
      Copy-Item -LiteralPath (Join-Path $directory 'T3 Code Fork.lnk') -Destination $existingPath
    }
  }
}
Write-Output "Installed T3 Code Fork shortcuts. Data: $forkRoot; profile: $profileRoot"
if ($Launch) { & $launcherPath }
