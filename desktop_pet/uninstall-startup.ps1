$startup = [Environment]::GetFolderPath("Startup")
$desktop = [Environment]::GetFolderPath("Desktop")

Remove-Item (Join-Path $startup "Lumina Llama.lnk") -Force -ErrorAction SilentlyContinue
Remove-Item (Join-Path $desktop "Lumina Llama.lnk") -Force -ErrorAction SilentlyContinue

Write-Host "Lumina Llama eliminada del inicio de Windows y del Escritorio." -ForegroundColor Yellow
