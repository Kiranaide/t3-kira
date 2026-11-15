param(
  [string]$InstallerPath,
  [switch]$Launch
)

$ErrorActionPreference = 'Stop'
$repository = 'Kiranaide/t3-kira'
$downloadedInstaller = $null
$releaseFile = $null

try {
  if (!$InstallerPath) {
    $releaseFile = [IO.Path]::GetTempFileName()
    curl.exe --fail --location --silent --show-error --max-time 60 --header 'Accept: application/vnd.github+json' "https://api.github.com/repos/$repository/releases?per_page=100" --output $releaseFile
    if ($LASTEXITCODE -ne 0) { throw 'Could not read the T3 Kira releases.' }
    $releases = Get-Content -LiteralPath $releaseFile -Raw | ConvertFrom-Json
    $release = $releases | Where-Object { !$_.draft -and $_.name -like 'T3 Kira v*' -and $_.tag_name -match '^v\d+\.\d+\.\d+-nightly\.\d{8}\.\d+$' } | Sort-Object published_at -Descending | Select-Object -First 1
    if (!$release) { throw 'No published T3 Kira nightly is available yet.' }
    $asset = $release.assets | Where-Object { $_.name -like 'T3-Kira-*-x64.exe' } | Select-Object -First 1
    if (!$asset) { throw 'This Kira release has no Windows x64 installer.' }
    $downloadedInstaller = Join-Path ([IO.Path]::GetTempPath()) ([Guid]::NewGuid().ToString() + '-' + $asset.name)
    curl.exe --fail --location --silent --show-error --max-time 600 $asset.browser_download_url --output $downloadedInstaller
    if ($LASTEXITCODE -ne 0) { throw 'The T3 Kira installer download failed.' }
    if ($asset.digest -match '^sha256:([a-fA-F0-9]{64})$') {
      $expectedHash = $Matches[1]
      if ((Get-FileHash -LiteralPath $downloadedInstaller -Algorithm SHA256).Hash -ne $expectedHash) {
        throw 'The T3 Kira installer checksum does not match GitHub.'
      }
    }
    $InstallerPath = $downloadedInstaller
  }

  $installer = (Resolve-Path -LiteralPath $InstallerPath).Path
  if ([IO.Path]::GetExtension($installer) -ne '.exe') { throw 'Pass a built T3 Kira NSIS installer.' }
  $appDirectory = [IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA 'Programs/t3-kira'))
  $kiraHome = [IO.Path]::GetFullPath((Join-Path $env:USERPROFILE '.t3-kira'))
  $profileDirectory = [IO.Path]::GetFullPath((Join-Path $env:APPDATA 't3-kira-v2'))
  $process = Start-Process -FilePath $installer -ArgumentList @('/S', "/D=$appDirectory") -Wait -PassThru -WindowStyle Hidden
  if ($process.ExitCode -ne 0) { throw "The Kira installer exited with code $($process.ExitCode)." }
  $executable = Join-Path $appDirectory 'T3 Kira.exe'
  if (!(Test-Path -LiteralPath $executable)) { throw 'The installer did not create T3 Kira.exe.' }
  Write-Output "Installed T3 Kira: $executable"
  Write-Output "App data: $kiraHome; browser profile: $profileDirectory"

  if ($Launch) {
    $names = @('T3CODE_HOME', 'T3CODE_DESKTOP_USER_DATA_DIR', 'T3CODE_DISABLE_AUTO_UPDATE', 'VITE_DEV_SERVER_URL', 'ELECTRON_RUN_AS_NODE')
    $savedEnvironment = @{}
    foreach ($name in $names) { $savedEnvironment[$name] = [Environment]::GetEnvironmentVariable($name, 'Process') }
    try {
      $env:T3CODE_HOME = $kiraHome
      $env:T3CODE_DESKTOP_USER_DATA_DIR = $profileDirectory
      foreach ($name in @('T3CODE_DISABLE_AUTO_UPDATE', 'VITE_DEV_SERVER_URL', 'ELECTRON_RUN_AS_NODE')) {
        [Environment]::SetEnvironmentVariable($name, $null, 'Process')
      }
      $kiraProcess = Start-Process -FilePath $executable -PassThru -WindowStyle Normal
      Write-Output "Started T3 Kira with PID $($kiraProcess.Id)."
    } finally {
      foreach ($name in $names) { [Environment]::SetEnvironmentVariable($name, $savedEnvironment[$name], 'Process') }
    }
  }
} finally {
  foreach ($temporaryFile in @($releaseFile, $downloadedInstaller)) {
    if ($temporaryFile -and (Test-Path -LiteralPath $temporaryFile)) { Remove-Item -LiteralPath $temporaryFile }
  }
}
