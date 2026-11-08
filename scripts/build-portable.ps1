$ErrorActionPreference='Stop'
if ($env:CI -ne 'true') { throw 'Portable packaging requires isolated CI' }
$version=(Get-Content -Raw package.json|ConvertFrom-Json).version
$bundle=Join-Path $PWD 'src-tauri/target/release/bundle/portable'
$stage=Join-Path $env:RUNNER_TEMP ('termix-portable-'+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $stage|Out-Null
New-Item -ItemType Directory -Force -Path $bundle|Out-Null
Copy-Item -LiteralPath 'src-tauri/target/release/termix.exe' -Destination (Join-Path $stage 'TermiX.exe')
Copy-Item -LiteralPath 'src-tauri/windows/generated/THIRD_PARTY_LICENSES.txt' -Destination $stage
Copy-Item -LiteralPath 'src-tauri/windows/generated/termix-v3.ico' -Destination $stage
[IO.File]::WriteAllText((Join-Path $stage 'portable.flag'),'TermiX portable mode')
[IO.File]::WriteAllText((Join-Path $stage 'README.txt'),"TermiX $version portable Windows x64`r`nExtract the complete ZIP to a writable folder and start TermiX.exe. Do not remove portable.flag.`r`nSettings, sessions, commands, known hosts and the WebView profile stay in data beside the EXE. No installed-version data is imported automatically.`r`nWindows WebView2 Runtime is required (normally present on Windows 11). Windows Credential Manager passwords stay on this PC/user and are isolated by portable-folder location. They do not travel on the USB drive.`r`nClose TermiX before updating. Replace application files and keep your existing data folder. Never include data when sharing the portable ZIP.`r`n")
$exe=Join-Path $stage 'TermiX.exe'
$process=Start-Process -FilePath $exe -WorkingDirectory $env:RUNNER_TEMP -WindowStyle Hidden -PassThru
try {
 Start-Sleep -Seconds 5
 if($process.HasExited){throw 'Portable app exited during startup'}
 if(!(Test-Path -LiteralPath (Join-Path $stage 'data'))){throw 'Portable data folder missing; executable-relative routing failed'}
 if(!(Test-Path -LiteralPath (Join-Path $stage 'data/webview'))){throw 'Portable WebView data was not isolated'}
} finally { $process.Refresh();if(!$process.HasExited){$process.Kill();$process.WaitForExit()} }
$archive=Join-Path $bundle "TermiX_${version}_x64-portable.zip"
# Explicit file list: never package the data directory created by the smoke test.
Compress-Archive -LiteralPath @((Join-Path $stage 'TermiX.exe'),(Join-Path $stage 'portable.flag'),(Join-Path $stage 'README.txt'),(Join-Path $stage 'termix-v3.ico'),(Join-Path $stage 'THIRD_PARTY_LICENSES.txt')) -DestinationPath $archive
Write-Output 'Portable startup, executable-relative data and WebView isolation verified; user data excluded from ZIP.'
