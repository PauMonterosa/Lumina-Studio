$ErrorActionPreference = "Stop"

$petDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$root = Split-Path -Parent $petDir
$scriptPath = Join-Path $petDir "lumina_llama.py"
$iconPath = Join-Path $petDir "assets\lumina_llama.ico"

$venvPythonw = Join-Path $root ".venv\Scripts\pythonw.exe"

if (Test-Path $venvPythonw) {
    $pythonw = $venvPythonw
}
else {
    $candidate = Get-Command pythonw.exe -ErrorAction SilentlyContinue
    if ($candidate) {
        $pythonw = $candidate.Source
    }
    else {
        throw "No encuentro pythonw.exe. Lumina ya usa Python para Scientific Engine; comprueba que .venv exista."
    }
}

$startup = [Environment]::GetFolderPath("Startup")
$desktop = [Environment]::GetFolderPath("Desktop")

$ws = New-Object -ComObject WScript.Shell

function New-LuminaShortcut($shortcutPath) {
    $shortcut = $ws.CreateShortcut($shortcutPath)
    $shortcut.TargetPath = $pythonw
    $shortcut.Arguments = "`"$scriptPath`""
    $shortcut.WorkingDirectory = $root
    if (Test-Path $iconPath) {
        $shortcut.IconLocation = $iconPath
    }
    $shortcut.Save()
}

New-LuminaShortcut (Join-Path $startup "Lumina Llama.lnk")
New-LuminaShortcut (Join-Path $desktop "Lumina Llama.lnk")

Write-Host "OK - Lumina Llama se iniciará con Windows." -ForegroundColor Green
Write-Host "OK - También he creado un acceso directo en el Escritorio." -ForegroundColor Green

# Launch now.
Start-Process -FilePath $pythonw -ArgumentList "`"$scriptPath`"" -WorkingDirectory $root
