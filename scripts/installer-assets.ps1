$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$target = Join-Path $PSScriptRoot '../src-tauri/windows/generated'
New-Item -ItemType Directory -Force -Path $target | Out-Null
Copy-Item -LiteralPath (Join-Path $PSScriptRoot '../src-tauri/icons/icon.ico') -Destination (Join-Path $target 'termix-v3.ico')
function Make-Art([int]$width, [int]$height, [string]$name, [bool]$sidebar) {
    $image = [Drawing.Bitmap]::new($width, $height)
    $graphics = [Drawing.Graphics]::FromImage($image)
    $graphics.SmoothingMode = [Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graphics.Clear([Drawing.Color]::FromArgb(247,249,252))
    $icon = [Drawing.Icon]::new((Join-Path $target 'termix-v3.ico'), 64, 64)
    $font = [Drawing.Font]::new('Segoe UI', $(if ($sidebar) { 19 } else { 14 }), [Drawing.FontStyle]::Bold)
    $small = [Drawing.Font]::new('Segoe UI', 10)
    $ink = [Drawing.SolidBrush]::new([Drawing.Color]::FromArgb(25,39,58))
    $muted = [Drawing.SolidBrush]::new([Drawing.Color]::FromArgb(91,109,131))
    $accent = [Drawing.SolidBrush]::new([Drawing.Color]::FromArgb(62,139,126))
    if ($sidebar) {
        $graphics.DrawIcon($icon, [Drawing.Rectangle]::new(22,35,64,64))
        $graphics.DrawString('TermiX', $font, $ink, 20,118)
        $graphics.FillRectangle($accent, 22,163,38,3)
        $graphics.DrawString("Your terminal.`nYour workspace.", $small, $muted, [Drawing.RectangleF]::new(22,184,125,70))
    } else {
        $graphics.DrawIcon($icon, [Drawing.Rectangle]::new(8,11,35,35))
        $graphics.DrawString('TermiX', $font, $ink, 52,14)
    }
    $image.Save((Join-Path $target $name), [Drawing.Imaging.ImageFormat]::Bmp)
    $graphics.Dispose(); $image.Dispose(); $icon.Dispose(); $font.Dispose(); $small.Dispose(); $ink.Dispose(); $muted.Dispose(); $accent.Dispose()
}
Make-Art 164 314 'sidebar.bmp' $true
Make-Art 150 57 'header.bmp' $false
