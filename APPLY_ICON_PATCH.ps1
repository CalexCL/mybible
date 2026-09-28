$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "MyBible PWA / Desktop Icon Patch" -ForegroundColor Yellow
Write-Host "Selected icon: No. 4 - Dove + Cross + Open Bible + myBible" -ForegroundColor Cyan
Write-Host ""

$root = Get-Location
$index = Join-Path $root "index.html"
$manifest = Join-Path $root "manifest.webmanifest"

if (!(Test-Path $index)) {
  Write-Host "ERROR: index.html was not found in this folder." -ForegroundColor Red
  Write-Host "Run this patch from the ROOT of your mybible-github folder."
  exit 2
}

# Back up before modifying
Copy-Item $index "$index.icon-backup" -Force
if (Test-Path $manifest) { Copy-Item $manifest "$manifest.icon-backup" -Force }

$html = Get-Content $index -Raw

# Add favicon / app icon metadata only once
if ($html -notmatch 'icons/icon-32\.png') {
  $headPatch = @'
  <meta name="theme-color" content="#8f5b19" />
  <meta name="application-name" content="MyBible" />
  <meta name="apple-mobile-web-app-title" content="MyBible" />
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <link rel="icon" type="image/png" sizes="32x32" href="icons/icon-32.png" />
  <link rel="icon" type="image/png" sizes="192x192" href="icons/icon-192.png" />
  <link rel="apple-touch-icon" sizes="180x180" href="icons/apple-touch-icon.png" />
  <link rel="shortcut icon" href="icons/mybible.ico" />
'@
  $html = $html -replace '(<link\s+rel="manifest"\s+href="manifest\.webmanifest"\s*/?>)', "`$1`r`n$headPatch"
}

# Load PWA installation helper only once
if ($html -notmatch 'src="pwa\.js"') {
  $html = $html -replace '</body>', "  <script src=`"pwa.js`" defer></script>`r`n</body>"
}

Set-Content -Path $index -Value $html -Encoding UTF8

Write-Host "Patch applied successfully." -ForegroundColor Green
Write-Host ""
Write-Host "Next commands:" -ForegroundColor Yellow
Write-Host "  git add ."
Write-Host '  git commit -m "Add MyBible desktop installation icon and PWA support"'
Write-Host "  git push origin main"
Write-Host ""
Write-Host "After GitHub Pages redeploys, open the live site in Chrome or Edge." -ForegroundColor Cyan
Write-Host "Use the browser Install App option or the MyBible down-arrow install button when available."