# Rebuilds the web bundle, syncs it into the WebView app's assets, and builds
# (optionally installs) the Android APK.
#
#   ./build-apk.ps1            # build web + apk
#   ./build-apk.ps1 -Install   # also install + launch on the connected device
param([switch]$Install)

$ErrorActionPreference = "Stop"
$root    = Split-Path -Parent $PSScriptRoot          # repo root
$client  = Join-Path $root "client"
$assets  = Join-Path $PSScriptRoot "app\src\main\assets"
$adb     = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"

$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
$env:PATH = "$env:JAVA_HOME\bin;$env:PATH"

Write-Host "==> Building web bundle (browser/localStorage build)..."
Push-Location $client
npm run build:gh
Pop-Location

Write-Host "==> Syncing dist -> android assets..."
Get-ChildItem -Path $assets -ErrorAction SilentlyContinue | Remove-Item -Recurse -Force
Copy-Item (Join-Path $client "dist\*") $assets -Recurse -Force

Write-Host "==> Building APK..."
Push-Location $PSScriptRoot
.\gradlew assembleDebug
Pop-Location

$apk = Join-Path $PSScriptRoot "app\build\outputs\apk\debug\app-debug.apk"
Write-Host "==> APK: $apk"

if ($Install) {
    Write-Host "==> Installing + launching..."
    & $adb install -r $apk
    & $adb shell am start -n "com.akismogh.retirementplanner/.MainActivity"
}
