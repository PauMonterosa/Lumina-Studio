# Verification gate (PowerShell) for Lumina Studio.
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

function Invoke-NpmScriptIfPresent {
  param(
    [string]$Name,
    [string]$Step
  )

  if (-not (Test-Path "package.json")) {
    Write-Host "==> [$Step] npm run $Name (skipped: package.json not present)"
    return
  }

  $package = Get-Content "package.json" -Raw | ConvertFrom-Json
  if ($null -eq $package.scripts -or -not ($package.scripts.PSObject.Properties.Name -contains $Name)) {
    Write-Host "==> [$Step] npm run $Name (skipped: script not present)"
    return
  }

  Write-Host "==> [$Step] npm run $Name"
  npm run $Name
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

Write-Host "==> [1/5] Validate feature_list.json"
python harness.py validate
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

if (Test-Path "package-lock.json") {
  Write-Host "==> [2/5] Install Node dependencies"
  npm ci
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
} else {
  Write-Host "==> [2/5] Install Node dependencies (skipped: package-lock.json not present)"
}

Invoke-NpmScriptIfPresent -Name "lint" -Step "3/5"
Invoke-NpmScriptIfPresent -Name "build" -Step "4/5"
Invoke-NpmScriptIfPresent -Name "test" -Step "5/5"

Write-Host ""
Write-Host "==> All checks passed."
