$ErrorActionPreference = 'Stop'
# Runs only on the disposable Windows CI machine, never on the user's desktop.
if ($env:CI -ne 'true') { throw 'Installer smoke test requires isolated CI' }
$installDir = Join-Path $env:RUNNER_TEMP 'TermiX-installer-check'
$installer = (Get-ChildItem 'src-tauri/target/release/bundle/nsis/*-setup.exe' | Select-Object -First 1).FullName
if (!$installer) { throw 'Installer missing' }
$desktop = [Environment]::GetFolderPath('Desktop')
$linkPath = Join-Path $desktop 'TermiX.lnk'
if (Test-Path -LiteralPath $linkPath) { throw 'Unexpected pre-existing shortcut in CI' }
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($linkPath)
$shortcut.TargetPath = Join-Path $installDir 'termix.exe'
$shortcut.IconLocation = "$env:WINDIR\System32\shell32.dll,0"
$shortcut.Save()
$process = Start-Process -FilePath $installer -ArgumentList @('/S', "/D=$installDir") -WindowStyle Hidden -Wait -PassThru
if ($process.ExitCode -ne 0) { throw "Installer exit $($process.ExitCode)" }
foreach ($name in @('termix.exe', 'termix-v3.ico', 'THIRD_PARTY_LICENSES.txt')) {
  if (!(Test-Path -LiteralPath (Join-Path $installDir $name))) { throw "Missing installed resource: $name" }
}
$installedIcon = Join-Path $installDir 'termix-v3.ico'
if ((Get-FileHash $installedIcon).Hash -ne (Get-FileHash 'src-tauri/icons/icon.ico').Hash) { throw 'Installed icon differs from source' }
$shortcut = $shell.CreateShortcut($linkPath)
if ($shortcut.TargetPath -ne (Join-Path $installDir 'termix.exe')) { throw 'Shortcut target changed' }
if ($shortcut.IconLocation -notlike "$installedIcon,*") { throw "Desktop shortcut still has old icon: $($shortcut.IconLocation)" }
Write-Output 'Silent installation, bundled licenses and existing desktop shortcut icon verified.'
