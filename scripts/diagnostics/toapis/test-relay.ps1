# ToAPIs connectivity diagnostic.
# Usage: $env:TOAPIS_API_KEY='<token>'; .\scripts\diagnostics\toapis\test-relay.ps1
# This script only calls GET /models and does not create a billable video task.

param(
    [string]$Endpoint = $(if ($env:TOAPIS_ENDPOINT) { $env:TOAPIS_ENDPOINT } else { 'https://toapis.com/v1' })
)

$Token = $env:TOAPIS_API_KEY

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($Token)) {
    throw 'TOAPIS_API_KEY is required. Set it as an environment variable before running this diagnostic.'
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Narrix ToAPIs Connectivity Test" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Endpoint : $Endpoint"
Write-Host "Token    : $($Token.Substring(0, [Math]::Min(8, $Token.Length)))****"
Write-Host ""

# ---- Test: GET /models ----
Write-Host "Testing GET /models ..." -ForegroundColor Yellow
try {
    $modelsUrl = "$Endpoint/models"
    $resp = Invoke-RestMethod -Uri $modelsUrl -Method Get -Headers @{
        Authorization = "Bearer $Token"
    } -ErrorAction Stop
    Write-Host "  [OK] /models request succeeded" -ForegroundColor Green
    $modelList = $resp.data | ForEach-Object { $_.id } | Select-Object -First 10
    if ($modelList) {
        Write-Host "  Available models (first 10):" -ForegroundColor DarkGray
        $modelList | ForEach-Object { Write-Host "    - $_" -ForegroundColor DarkGray }
    }
} catch {
    $status = $_.Exception.Response.StatusCode.value__
    Write-Host "  [FAIL] /models request failed (HTTP $status)" -ForegroundColor Red
    try {
        $reader = [System.IO.StreamReader]::new($_.Exception.Response.GetResponseStream())
        $body = $reader.ReadToEnd()
        Write-Host "  Response: $body" -ForegroundColor DarkRed
    } catch {
        Write-Host "  $($_.Exception.Message)" -ForegroundColor DarkRed
    }
    Write-Host "  Verify the endpoint and API key, then retry." -ForegroundColor DarkGray
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Test Complete" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
