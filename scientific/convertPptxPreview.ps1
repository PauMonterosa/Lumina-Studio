param(
    [Parameter(Mandatory=$true)][string]$InputPath,
    [Parameter(Mandatory=$true)][string]$OutputPath
)

$ErrorActionPreference = "Stop"
$powerPoint = $null
$presentation = $null

try {
    $inputFull = [System.IO.Path]::GetFullPath($InputPath)
    $outputFull = [System.IO.Path]::GetFullPath($OutputPath)
    $outputDir = [System.IO.Path]::GetDirectoryName($outputFull)
    [System.IO.Directory]::CreateDirectory($outputDir) | Out-Null

    $powerPoint = New-Object -ComObject PowerPoint.Application
    # Open: FileName, ReadOnly, Untitled, WithWindow
    $presentation = $powerPoint.Presentations.Open($inputFull, $true, $false, $false)
    # ppSaveAsPDF = 32
    $presentation.SaveAs($outputFull, 32)
    $presentation.Close()
    $presentation = $null

    if (-not (Test-Path $outputFull)) {
        throw "PowerPoint terminó sin crear el PDF de vista previa."
    }

    Write-Output "OK"
    exit 0
}
catch {
    Write-Error $_.Exception.Message
    exit 1
}
finally {
    if ($presentation -ne $null) {
        try { $presentation.Close() } catch {}
    }
    if ($powerPoint -ne $null) {
        try { $powerPoint.Quit() } catch {}
        try { [System.Runtime.InteropServices.Marshal]::ReleaseComObject($powerPoint) | Out-Null } catch {}
    }
    [GC]::Collect()
    [GC]::WaitForPendingFinalizers()
}
