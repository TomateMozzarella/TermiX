$ErrorActionPreference = 'Stop'
# Runs only on the disposable Windows CI machine, never on the user's desktop.
if ($env:CI -ne 'true') { throw 'Installer smoke test requires isolated CI' }
$installDir = Join-Path $env:RUNNER_TEMP 'TermiX-installer-check'
$version = (Get-Content -Raw 'package.json' | ConvertFrom-Json).version
$installers = @(Get-ChildItem 'src-tauri/target/release/bundle/nsis/*-setup.exe' | Where-Object { $_.Name.StartsWith("TermiX_${version}_") })
if ($installers.Count -ne 1) { throw 'Expected exactly one installer for the current version' }
$installer = $installers[0].FullName
if (!$installer) { throw 'Installer missing' }

$bootstrapInstaller = $installer
$bootstrapVersion = $version
$upgradeBaselines = @{
 '0.10.0' = @{ Version = '0.9.0'; Hash = '38D79115A06F675EF9B2D3FC24F895DEBAB99F2103A5D98A5FBDD347447616BE' }
 '0.11.0' = @{ Version = '0.10.0'; Hash = '01777E131AC56CD93F6995195BBFF510CBD32338055ADD010DF556801D9C87E3' }
 '0.12.0' = @{ Version = '0.11.2'; Hash = '7331A41AB5C19BFCD80252FB86FDCE01958C5915D6A09FFAD7492EB61F05D1D6' }
}
$baseline = $upgradeBaselines[$version]
if ($baseline) {
 $bootstrapVersion = $baseline.Version
 $baselineDir = Join-Path $env:RUNNER_TEMP "termix-baseline-$bootstrapVersion"
 $baselineFile = "TermiX_${bootstrapVersion}_x64-setup.exe"
 New-Item -ItemType Directory -Force -Path $baselineDir | Out-Null
 gh release download "v$bootstrapVersion" --repo $env:GH_REPO --pattern $baselineFile --dir $baselineDir
 if ($LASTEXITCODE -ne 0) { throw "Could not download the v$bootstrapVersion upgrade baseline" }
 $bootstrapInstaller = Join-Path $baselineDir $baselineFile
 if ((Get-FileHash $bootstrapInstaller -Algorithm SHA256).Hash -ne $baseline.Hash) { throw 'Upgrade baseline checksum mismatch' }
}
$desktop = [Environment]::GetFolderPath('Desktop')
$linkPath = Join-Path $desktop 'TermiX.lnk'
if (Test-Path -LiteralPath $linkPath) { throw 'Unexpected pre-existing shortcut in CI' }
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($linkPath)
$shortcut.TargetPath = Join-Path $installDir 'termix.exe'
$shortcut.IconLocation = "$env:WINDIR\System32\shell32.dll,0"
$shortcut.Save()
$process = Start-Process -FilePath $bootstrapInstaller -ArgumentList @('/S', "/D=$installDir") -WindowStyle Hidden -Wait -PassThru
if ($process.ExitCode -ne 0) { throw "Installer exit $($process.ExitCode)" }
foreach ($name in @('termix.exe', 'termix-v3.ico', 'THIRD_PARTY_LICENSES.txt')) {
  if (!(Test-Path -LiteralPath (Join-Path $installDir $name))) { throw "Missing installed resource: $name" }
}
$expectedVersion = [version]$bootstrapVersion
$installedVersion = [Diagnostics.FileVersionInfo]::GetVersionInfo((Join-Path $installDir 'termix.exe'))
if ($installedVersion.ProductMajorPart -ne $expectedVersion.Major -or $installedVersion.ProductMinorPart -ne $expectedVersion.Minor -or $installedVersion.ProductBuildPart -ne $expectedVersion.Build) { throw 'Installed executable is from another version' }
$installedIcon = Join-Path $installDir 'termix-v3.ico'
if ((Get-FileHash $installedIcon).Hash -ne (Get-FileHash 'src-tauri/icons/icon.ico').Hash) { throw 'Installed icon differs from source' }
$shortcut = $shell.CreateShortcut($linkPath)
if ($shortcut.TargetPath -ne (Join-Path $installDir 'termix.exe')) { throw 'Shortcut target changed' }
if ($shortcut.IconLocation -notlike "$installedIcon,*") { throw "Desktop shortcut still has old icon: $($shortcut.IconLocation)" }

# Upgrade with a live installed application and seeded per-user metadata.
$dataDir = Join-Path $env:APPDATA 'dev.termix.desktop'
New-Item -ItemType Directory -Force -Path $dataDir | Out-Null
$seed = @{
 'sessions.json' = '{"schemaVersion":2,"revision":1,"folders":[{"id":"retained-folder","name":"Operations"}],"sessions":[{"id":"retained-session","name":"Keep this server","kind":"ssh","host":"example.test","port":22,"username":"test","group":"retained-folder","favorite":true}]}'
 'preferences.json' = '{"schemaVersion":2,"setupVersion":2,"setupComplete":true,"defaultShell":"powershell","fontSize":15,"language":"en","theme":"dark","accent":"#71c9bd","editor":"integrated","editorPath":"","uiScale":100}'
 'known-hosts.json' = '{}'
 'commands.json' = '{"schemaVersion":1,"entries":[{"id":"92111111-1111-4111-8111-111111111111","name":"Keep command","text":"echo keep"}]}'
}
$before = @{}
foreach ($fileName in $seed.Keys) {
 [IO.File]::WriteAllText((Join-Path $dataDir $fileName), $seed[$fileName])
 $before[$fileName] = (Get-FileHash (Join-Path $dataDir $fileName)).Hash
}
$appProcess = Start-Process -FilePath (Join-Path $installDir 'termix.exe') -WindowStyle Hidden -PassThru
try {
 Start-Sleep -Seconds 4
 if ($appProcess.HasExited) { throw 'Installed app failed to remain running before upgrade' }
 $upgrade = Start-Process -FilePath $installer -ArgumentList @('/S', "/D=$installDir") -WindowStyle Hidden -Wait -PassThru
 if ($upgrade.ExitCode -ne 0) { throw 'Upgrade of running application failed' }
 $appProcess.Refresh()
 if (!$appProcess.HasExited) { throw 'Upgrade did not close the exact installed application' }
 foreach ($fileName in $seed.Keys) { if ((Get-FileHash (Join-Path $dataDir $fileName)).Hash -ne $before[$fileName]) { throw "Upgrade changed user data: $fileName" } }
} finally { $appProcess.Refresh(); if (!$appProcess.HasExited) { $appProcess.Kill() } }
$finalVersion = [Diagnostics.FileVersionInfo]::GetVersionInfo((Join-Path $installDir 'termix.exe'))
$expectedVersion = [version]$version
if ($finalVersion.ProductMajorPart -ne $expectedVersion.Major -or $finalVersion.ProductMinorPart -ne $expectedVersion.Minor -or $finalVersion.ProductBuildPart -ne $expectedVersion.Build) { throw 'Upgrade installed the wrong executable version' }
Write-Output "Verified upgrade from $bootstrapVersion to $version."
Write-Output 'Upgrade closes the running installed app and preserves catalog, preferences and known hosts byte-for-byte.'
Write-Output "Silent installation of $version, executable version, bundled licenses and existing desktop shortcut icon verified."
