param(
  [string]$RepoUrl = "https://github.com/CalexCL/mybible.git",
  [string]$Branch = "main",
  [string]$CommitMessage = "Deploy MyBible web app"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Write-Step([string]$Message) {
  Write-Host "`n==> $Message" -ForegroundColor Cyan
}

function Fail([string]$Message) {
  Write-Host "`nERROR: $Message" -ForegroundColor Red
  exit 1
}

# Always run from the folder containing this script.
Set-Location -LiteralPath $PSScriptRoot

Write-Host "MyBible GitHub Pages deployment" -ForegroundColor Green
Write-Host "Repository: $RepoUrl"
Write-Host "Branch:     $Branch"

if (-not (Test-Path "index.html")) {
  Fail "index.html was not found. Keep this script in the MyBible project root."
}

# Make sure Git is available.
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
  Fail "Git is not installed or is not in PATH. Install Git for Windows from https://git-scm.com/download/win and run this script again."
}

Write-Step "Checking Git identity"
$userName = (git config --global user.name 2>$null)
$userEmail = (git config --global user.email 2>$null)

if ([string]::IsNullOrWhiteSpace($userName)) {
  $userName = Read-Host "Git user name (example: CalexCL)"
  if ([string]::IsNullOrWhiteSpace($userName)) { Fail "Git user name is required." }
  git config --global user.name "$userName"
}

if ([string]::IsNullOrWhiteSpace($userEmail)) {
  $userEmail = Read-Host "Git email (use the email attached to your GitHub account)"
  if ([string]::IsNullOrWhiteSpace($userEmail)) { Fail "Git email is required." }
  git config --global user.email "$userEmail"
}

if (-not (Test-Path ".git")) {
  Write-Step "Initializing local Git repository"
  git init
  git branch -M $Branch

  if ((git remote) -contains "origin") {
    git remote set-url origin $RepoUrl
  } else {
    git remote add origin $RepoUrl
  }

  Write-Step "Checking whether the GitHub repository already has a '$Branch' branch"
  git ls-remote --exit-code --heads origin $Branch *> $null
  $remoteBranchExists = ($LASTEXITCODE -eq 0)

  if ($remoteBranchExists) {
    Write-Host "The remote repository already contains a '$Branch' branch." -ForegroundColor Yellow
    Write-Host "To avoid overwriting existing work, this first-deploy script will stop." -ForegroundColor Yellow
    Write-Host "Clone the repository first, copy these project files into the clone, then run this script from that clone." -ForegroundColor Yellow
    exit 2
  }
} else {
  Write-Step "Using existing local Git repository"
  git branch -M $Branch
  if ((git remote) -contains "origin") {
    git remote set-url origin $RepoUrl
  } else {
    git remote add origin $RepoUrl
  }
}

Write-Step "Staging files"
git add -A

$changes = git status --porcelain
if ([string]::IsNullOrWhiteSpace(($changes -join ""))) {
  Write-Host "No file changes to commit." -ForegroundColor Yellow
} else {
  Write-Step "Creating commit"
  git commit -m "$CommitMessage"
}

Write-Step "Pushing to GitHub"
Write-Host "If GitHub asks you to sign in, authenticate with the CalexCL account." -ForegroundColor Yellow
git push -u origin $Branch

if ($LASTEXITCODE -ne 0) {
  Fail "git push failed. Check the sign-in account and repository permissions, then run this script again."
}

Write-Host "`nSUCCESS: MyBible was pushed to GitHub." -ForegroundColor Green
Write-Host "Next one-time GitHub step:" -ForegroundColor Cyan
Write-Host "  Repository > Settings > Pages > Build and deployment > Source > GitHub Actions"
Write-Host "Then open Actions and wait for 'Deploy MyBible to GitHub Pages' to finish."
Write-Host "Expected site URL: https://calexcl.github.io/mybible/"
Write-Host "`nPress Enter to close..."
[void](Read-Host)
