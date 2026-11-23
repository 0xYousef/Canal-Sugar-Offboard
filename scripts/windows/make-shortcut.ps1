param([string]$UserHome, [string]$Target)
$desk = Join-Path $UserHome 'Desktop'
if (-not (Test-Path $desk)) {
  $od = Join-Path $UserHome 'OneDrive\Desktop'          # desktops that are kept in OneDrive
  if (Test-Path $od) { $desk = $od }
}
$ws  = New-Object -ComObject WScript.Shell
$lnk = $ws.CreateShortcut((Join-Path $desk 'Canal Sugar Offboarding.lnk'))
$lnk.TargetPath       = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
$lnk.Arguments        = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$Target\files\launch.ps1`""
$lnk.WorkingDirectory = "$Target\files"
$lnk.IconLocation     = "$Target\files\icon.ico"
$lnk.WindowStyle      = 7
$lnk.Description      = 'Canal Sugar Offboarding'
$lnk.Save()
