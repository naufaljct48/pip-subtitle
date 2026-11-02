# Capture one top-level window whose title matches -Title (regex) via PrintWindow.
param([string]$Title, [string]$Out)
Add-Type -AssemblyName System.Drawing
Add-Type @"
using System;
using System.Text;
using System.Runtime.InteropServices;
public class W3 {
  public delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc f, IntPtr l);
  [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr h, IntPtr dc, uint f);
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  public struct RECT { public int L, T, R, B; }
}
"@
# Physical pixels; otherwise GetWindowRect is scaled and the bitmap clips the window.
[void][W3]::SetProcessDPIAware()
# The browser window and a Document PiP window can share a title: take the smallest match.
$found = $null
$best = [int64]::MaxValue
$titles = @()
$cb = [W3+EnumProc]{ param($h, $l)
  if ([W3]::IsWindowVisible($h)) {
    $sb = New-Object System.Text.StringBuilder 256
    [void][W3]::GetWindowText($h, $sb, 256)
    $t = $sb.ToString()
    if ($t) { $script:titles += $t }
    if ($t -match $Title) {
      $rr = New-Object W3+RECT; [void][W3]::GetWindowRect($h, [ref]$rr)
      $area = [int64]($rr.R - $rr.L) * ($rr.B - $rr.T)
      if ($area -gt 0 -and $area -lt $script:best) { $script:best = $area; $script:found = $h }
    }
  }
  return $true }
[void][W3]::EnumWindows($cb, [IntPtr]::Zero)
if (-not $found) { Write-Output ("NO_WINDOW; titles: " + (($titles | Select-Object -First 12) -join ' | ')); exit 1 }
$r = New-Object W3+RECT; [void][W3]::GetWindowRect($found, [ref]$r)
$w = $r.R - $r.L; $h = $r.B - $r.T
$bmp = New-Object System.Drawing.Bitmap $w, $h
$g = [System.Drawing.Graphics]::FromImage($bmp); $dc = $g.GetHdc()
[void][W3]::PrintWindow($found, $dc, 2); $g.ReleaseHdc($dc); $g.Dispose()
$bmp.Save($Out, [System.Drawing.Imaging.ImageFormat]::Png)
Write-Output "SAVED $w x $h"
