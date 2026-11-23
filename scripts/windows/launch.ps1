# Starts the portal in the background (no window). The browser opens by itself.
$files = $PSScriptRoot
Start-Process -FilePath (Join-Path $files 'runtime\node.exe') `
  -ArgumentList ('"' + (Join-Path $files 'server\server.cjs') + '"') `
  -WorkingDirectory $files -WindowStyle Hidden
