$ErrorActionPreference = 'Stop'
if ($env:CI -ne 'true') { throw 'Native integration fixture requires isolated CI' }
$fixtureDir = Join-Path $env:RUNNER_TEMP 'termix-ssh-fixture'
New-Item -ItemType Directory -Force $fixtureDir | Out-Null
$server = Start-Process python -ArgumentList @('scripts/ssh-test-server.py', '--directory', $fixtureDir, '--port', '22222') -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $fixtureDir 'server.out') -RedirectStandardError (Join-Path $fixtureDir 'server.err')
try {
  $deadline = (Get-Date).AddSeconds(30)
  while (!(Test-Path (Join-Path $fixtureDir 'ready'))) {
    if ($server.HasExited -or (Get-Date) -gt $deadline) { throw 'SSH fixture did not start' }
    Start-Sleep -Milliseconds 100
  }
  $env:TERMIX_SSH_TEST_DIR = $fixtureDir
  $env:TERMIX_SSH_TEST_PORT = '22222'
  Set-Service ssh-agent -StartupType Manual
  Start-Service ssh-agent
  foreach ($name in @('unrelated-agent-key.pem', 'agent-key.pem')) {
    $key = Join-Path $fixtureDir $name
    icacls $key /inheritance:r /grant:r "${env:USERNAME}:R"
    if ($LASTEXITCODE -ne 0) { throw 'Could not restrict isolated test key permissions' }
    & "$env:WINDIR/System32/OpenSSH/ssh-add.exe" $key
    if ($LASTEXITCODE -ne 0) { throw 'Could not add isolated test key to SSH agent' }
  }

  $helperSource = Join-Path $fixtureDir 'editor-helper.cs'
  $helperExe = Join-Path $fixtureDir 'editor-helper.exe'
  @'
using System;
using System.IO;
class EditorFixture {
 [STAThread] static void Main(string[] args) {
  if (args.Length != 1 || !Path.GetFullPath(args[0]).StartsWith(Path.GetTempPath(), StringComparison.OrdinalIgnoreCase)) Environment.Exit(2);
  File.WriteAllText(args[0], "external fixture edit");
 }
}
'@ | Set-Content -LiteralPath $helperSource
  & "$env:WINDIR/Microsoft.NET/Framework64/v4.0.30319/csc.exe" /nologo /target:winexe "/out:$helperExe" $helperSource
  if ($LASTEXITCODE -ne 0) { throw 'External editor fixture compilation failed' }
  $env:TERMIX_EDITOR_TEST_EXE = $helperExe
  $env:TERMIX_SSH_AGENT_TEST = '1'
  # Keep the fixture's parent alive throughout the tests. Windows may terminate
  # a hidden child when the earlier runner step's console closes.
  cargo test --locked --manifest-path src-tauri/Cargo.toml -- --test-threads=1
  if ($LASTEXITCODE -ne 0) { throw 'Native integration tests failed' }
} finally {
  if (!$server.HasExited) { $server.Kill(); $server.WaitForExit() }
  if (Test-Path (Join-Path $fixtureDir 'server.err')) { Get-Content (Join-Path $fixtureDir 'server.err') }
}
