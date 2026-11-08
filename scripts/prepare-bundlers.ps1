$ErrorActionPreference='Stop'
if($env:CI -ne 'true'){throw 'Bundler provisioning requires isolated CI'}
$PSNativeCommandUseErrorActionPreference=$false
$cache=Join-Path $env:LOCALAPPDATA 'tauri'
$stage=Join-Path $env:RUNNER_TEMP ('termix-bundlers-'+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force -Path $cache,$stage|Out-Null
# Official Tauri bundler versions and checksums; never execute an unchecked download.
# https://github.com/tauri-apps/tauri/tree/dev/crates/tauri-bundler/src/bundle/windows
function Get-Verified([string]$url,[string]$name,[string]$algorithm,[string]$hash) {
  $file=Join-Path $stage $name
  for($attempt=1;$attempt -le 5;$attempt++) {
    & curl.exe --fail --location --silent --show-error --connect-timeout 20 --max-time 120 --output $file "${url}?termix=$env:GITHUB_RUN_ID-$attempt"
    if($LASTEXITCODE -eq 0) {
      if((Get-FileHash -LiteralPath $file -Algorithm $algorithm).Hash -ne $hash){throw "Checksum mismatch: $name"}
      return $file
    }
    if($attempt -eq 5){throw "Official bundler download failed: $name"}
    Start-Sleep -Seconds (2*$attempt)
  }
}
$nsis=Get-Verified 'https://github.com/tauri-apps/binary-releases/releases/download/nsis-3.13/nsis-3.13.zip' 'nsis.zip' 'SHA1' 'DB14F8AF2EA346B786C6AE19343F61AAF5E09B8E'
Expand-Archive -LiteralPath $nsis -DestinationPath $stage
Move-Item -LiteralPath (Join-Path $stage 'nsis-3.13') -Destination (Join-Path $cache 'NSIS')
$plugin=Get-Verified 'https://github.com/tauri-apps/nsis-tauri-utils/releases/download/nsis_tauri_utils-v0.5.3/nsis_tauri_utils.dll' 'nsis_tauri_utils.dll' 'SHA1' '75197FEE3C6A814FE035788D1C34EAD39349B860'
$plugins=Join-Path $cache 'NSIS/Plugins/x86-unicode/additional'
New-Item -ItemType Directory -Force -Path $plugins|Out-Null
Copy-Item -LiteralPath $plugin -Destination $plugins
$wix=Get-Verified 'https://github.com/wixtoolset/wix3/releases/download/wix3141rtm/wix314-binaries.zip' 'wix.zip' 'SHA256' '6ac824e1642d6f7277d0ed7ea09411a508f6116ba6fae0aa5f2c7daa2ff43d31'
Expand-Archive -LiteralPath $wix -DestinationPath (Join-Path $cache 'WixTools314')
Write-Output 'Official NSIS, Tauri plugin and WiX downloads verified.'

