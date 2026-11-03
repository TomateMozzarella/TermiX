$ErrorActionPreference = 'Stop'
# Compiler caches may contain bundles from older versions. Delete only the
# explicitly checked packaging output, retaining all compiled dependencies.
$workspaceRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$bundlePath = [IO.Path]::GetFullPath((Join-Path $workspaceRoot 'src-tauri/target/release/bundle'))
$prefix = $workspaceRoot.TrimEnd('\', '/') + [IO.Path]::DirectorySeparatorChar
if (!$bundlePath.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase) -or $bundlePath -eq $workspaceRoot) {
  throw 'Packaging output is outside the workspace'
}
$cursor = $workspaceRoot
foreach ($part in @('src-tauri', 'target', 'release', 'bundle')) {
  $cursor = Join-Path $cursor $part
  if (Test-Path -LiteralPath $cursor) {
    if ((Get-Item -LiteralPath $cursor -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Refusing to clean a redirected output directory' }
  }
}
if (Test-Path -LiteralPath $bundlePath) { Remove-Item -LiteralPath $bundlePath -Recurse -Force }
Write-Output 'Previous installer output cleared within the verified workspace path.'
