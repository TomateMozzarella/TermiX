$ErrorActionPreference='Stop'
$PSNativeCommandUseErrorActionPreference=$false
$log=Join-Path $env:RUNNER_TEMP 'termix-packaging.log'
for($attempt=1;$attempt -le 3;$attempt++) {
  & npm.cmd run tauri build 2>&1 | Tee-Object -FilePath $log
  if($LASTEXITCODE -eq 0){exit 0}
  $detail=Get-Content -Raw -LiteralPath $log
  if($attempt -eq 3 -or $detail -notmatch 'http status: 5\d\d|connection reset|operation timed out') {
    throw 'Windows packaging failed; see original output above'
  }
  Write-Output "Transient packaging download failure; retry $attempt of 2."
  Start-Sleep -Seconds (5*$attempt)
}

