Add-Type -AssemblyName System.Drawing

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$outDir = Join-Path $root "public"
$out = Join-Path $outDir "market-logo-3d.png"
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

$w = 1200
$h = 620
$bitmap = New-Object System.Drawing.Bitmap $w, $h, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$g = [System.Drawing.Graphics]::FromImage($bitmap)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.Clear([System.Drawing.Color]::Transparent)

function Color($a, $r, $g, $b) {
  [System.Drawing.Color]::FromArgb($a, $r, $g, $b)
}

function Pt($x, $y) {
  New-Object System.Drawing.PointF ([single]$x), ([single]$y)
}

function Rect($x, $y, $w, $h) {
  New-Object System.Drawing.RectangleF ([single]$x), ([single]$y), ([single]$w), ([single]$h)
}

function RoundedPath($x, $y, $w, $h, $r) {
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = $r * 2
  $path.AddArc((Rect $x $y $d $d), 180, 90)
  $path.AddArc((Rect ($x + $w - $d) $y $d $d), 270, 90)
  $path.AddArc((Rect ($x + $w - $d) ($y + $h - $d) $d $d), 0, 90)
  $path.AddArc((Rect $x ($y + $h - $d) $d $d), 90, 90)
  $path.CloseFigure()
  return $path
}

function Draw-SoftPathShadow($path, $dx, $dy, $alpha) {
  $state = $script:g.Save()
  $script:g.TranslateTransform($dx, $dy)
  for ($i = 8; $i -ge 1; $i--) {
    $pen = New-Object System.Drawing.Pen (Color ([int]($alpha / ($i + 2))) 0 0 0), ([single]($i * 3.2))
    $script:g.DrawPath($pen, $path)
    $pen.Dispose()
  }
  $brush = New-Object System.Drawing.SolidBrush (Color ([int]($alpha * 0.38)) 0 0 0)
  $script:g.FillPath($brush, $path)
  $brush.Dispose()
  $script:g.Restore($state)
}

function Fill-PathGradient($path, $x1, $y1, $x2, $y2, $c1, $c2) {
  $brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush (Pt $x1 $y1), (Pt $x2 $y2), $c1, $c2
  $script:g.FillPath($brush, $path)
  $brush.Dispose()
}

function Add-Polygon($path, $coords) {
  $points = @()
  for ($i = 0; $i -lt $coords.Count; $i += 2) {
    $points += Pt $coords[$i] $coords[$i + 1]
  }
  $path.AddPolygon($points)
}

function Draw-Bar($x, $y, $bw, $bh) {
  $path = RoundedPath $x $y $bw $bh 8
  Draw-SoftPathShadow $path 10 14 70
  Fill-PathGradient $path $x $y ($x + $bw) ($y + $bh) (Color 255 31 31 32) (Color 255 78 78 78)

  $side = New-Object System.Drawing.Drawing2D.GraphicsPath
  Add-Polygon $side @(
    ($x + $bw - 20), ($y + 8),
    ($x + $bw), ($y + 2),
    ($x + $bw), ($y + $bh - 6),
    ($x + $bw - 20), ($y + $bh - 1)
  )
  $sideBrush = New-Object System.Drawing.SolidBrush (Color 118 0 0 0)
  $script:g.FillPath($sideBrush, $side)
  $sideBrush.Dispose()
  $side.Dispose()

  $shinePath = RoundedPath ($x + 10) ($y + 12) 16 ($bh - 22) 5
  $shine = New-Object System.Drawing.SolidBrush (Color 44 255 255 255)
  $script:g.FillPath($shine, $shinePath)
  $shine.Dispose()
  $shinePath.Dispose()
  $path.Dispose()
}

function Draw-Bear {
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $path.FillMode = [System.Drawing.Drawing2D.FillMode]::Winding
  $path.StartFigure()
  $path.AddBezier((Pt 47 432), (Pt 62 391), (Pt 118 378), (Pt 168 390))
  $path.AddBezier((Pt 168 390), (Pt 204 398), (Pt 222 424), (Pt 214 462))
  $path.AddBezier((Pt 214 462), (Pt 206 505), (Pt 165 531), (Pt 103 524))
  $path.AddBezier((Pt 103 524), (Pt 53 518), (Pt 28 484), (Pt 47 432))
  $path.CloseFigure()
  Add-Polygon $path @(50,418, 78,392, 115,393, 125,416, 93,432, 58,432)
  Add-Polygon $path @(66,393, 73,358, 91,391)
  Add-Polygon $path @(50,423, 18,437, 43,451)
  foreach ($leg in @(@(70,96), @(143,169))) {
    $legPath = RoundedPath $leg[0] 491 ($leg[1] - $leg[0]) 71 10
    $path.AddPath($legPath, $false)
    $legPath.Dispose()
    Add-Polygon $path @($leg[0],553, ($leg[0] - 12),574, ($leg[1] + 6),574, $leg[1],553)
  }

  Draw-SoftPathShadow $path 8 14 70
  Fill-PathGradient $path 20 380 266 540 (Color 255 204 45 52) (Color 255 30 30 31)

  $state = $script:g.Save()
  $script:g.SetClip($path)
  $glow = New-Object System.Drawing.Drawing2D.LinearGradientBrush (Rect 64 392 140 58), (Color 120 255 65 71), (Color 0 255 65 71), 0
  $script:g.FillEllipse($glow, (Rect 65 392 138 58))
  $glow.Dispose()
  $script:g.Restore($state)
  $path.Dispose()
}

function Draw-Bull {
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $path.FillMode = [System.Drawing.Drawing2D.FillMode]::Winding
  $path.StartFigure()
  $path.AddBezier((Pt 807 375), (Pt 872 329), (Pt 936 298), (Pt 1001 300))
  $path.AddBezier((Pt 1001 300), (Pt 1044 302), (Pt 1081 321), (Pt 1106 350))
  $path.AddLine((Pt 1106 350), (Pt 1157 352))
  $path.AddBezier((Pt 1157 352), (Pt 1188 354), (Pt 1194 382), (Pt 1162 392))
  $path.AddLine((Pt 1162 392), (Pt 1116 393))
  $path.AddBezier((Pt 1116 393), (Pt 1129 425), (Pt 1105 452), (Pt 1068 455))
  $path.AddBezier((Pt 1068 455), (Pt 1031 500), (Pt 948 513), (Pt 872 482))
  $path.AddBezier((Pt 872 482), (Pt 823 462), (Pt 793 421), (Pt 807 375))
  $path.CloseFigure()
  Add-Polygon $path @(1084,346, 1152,286, 1180,248, 1121,338)
  Add-Polygon $path @(1133,348, 1191,308, 1200,276, 1164,357)
  Add-Polygon $path @(1008,442, 1040,552, 1090,552, 1053,431)
  Add-Polygon $path @(881,436, 849,552, 903,552, 930,443)
  Add-Polygon $path @(1038,545, 1017,577, 1098,577, 1090,545)
  Add-Polygon $path @(850,545, 831,577, 912,577, 903,545)
  Add-Polygon $path @(826,391, 770,418, 830,436)

  Draw-SoftPathShadow $path -4 15 78
  Fill-PathGradient $path 770 300 1200 470 (Color 255 24 25 25) (Color 255 46 126 68)
  $dark = New-Object System.Drawing.Drawing2D.LinearGradientBrush (Rect 1040 320 180 120), (Color 20 40 175 82), (Color 155 20 20 20), 0
  $state = $script:g.Save()
  $script:g.SetClip($path)
  $script:g.FillEllipse($dark, (Rect 1000 312 180 122))
  $dark.Dispose()
  $highlight = New-Object System.Drawing.Drawing2D.LinearGradientBrush (Rect 855 278 210 105), (Color 126 35 226 90), (Color 0 35 226 90), 0
  $script:g.FillEllipse($highlight, (Rect 854 282 205 104))
  $highlight.Dispose()
  $script:g.Restore($state)
  $path.Dispose()
}

$floorBrush = New-Object System.Drawing.SolidBrush (Color 42 0 0 0)
$g.FillEllipse($floorBrush, (Rect 45 552 1085 54))
$floorBrush.Dispose()

Draw-Bear
Draw-Bar 272 360 98 208
Draw-Bar 440 250 102 318
Draw-Bar 610 145 102 423
Draw-Bar 780 42 104 526
Draw-Bull

$basePath = RoundedPath 66 562 1039 12 5
$baseBrush = New-Object System.Drawing.SolidBrush (Color 235 31 31 31)
$g.FillPath($baseBrush, $basePath)
$baseBrush.Dispose()
$greenBrush = New-Object System.Drawing.SolidBrush (Color 150 43 143 75)
$g.FillRectangle($greenBrush, (Rect 776 562 329 12))
$greenBrush.Dispose()
$redBrush = New-Object System.Drawing.SolidBrush (Color 145 190 45 51)
$g.FillRectangle($redBrush, (Rect 66 562 194 12))
$redBrush.Dispose()
$basePath.Dispose()

$bitmap.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose()
$bitmap.Dispose()
Write-Output $out
