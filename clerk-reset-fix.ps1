param(
    [string]$RepoPath = "D:\OneDrive\Documents\GitHub\coin-compass-calendar-fc6c3153",
    [string]$PatchCommit = "95052f4",
    [string]$BranchName = "clerk-auth-fix-clean",
    [string]$PublishableKey = "pk_test_ZmFuY3ktc3VuYmVhbS0zNy5jbGVyay5hY2NvdW50cy5kZXYk",
    [string]$WorkerApiUrl = "https://cryptotracker-api.taheito26.workers.dev",
    [string]$ClerkJwksUrl = "https://fancy-sunbeam-37.clerk.accounts.dev/.well-known/jwks.json",
    [string]$AllowedOrigins = "http://localhost:8081,https://cryptotracker-api.taheito26.workers.dev",
    [switch]$SkipBackendDeploy,
    [switch]$SkipCommit,
    [switch]$SkipPush
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Write-Step {
    param([string]$Message)
    Write-Host ""
    Write-Host "=== $Message ===" -ForegroundColor Cyan
}

function Write-Utf8NoBom {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$Content
    )
    $dir = Split-Path -Parent $Path
    if ($dir -and -not (Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
    }
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($Path, $Content, $utf8NoBom)
}

function Ensure-LineInFile {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$Line
    )
    $content = if (Test-Path $Path) { Get-Content $Path -Raw } else { "" }
    if ($content -notmatch [regex]::Escape($Line)) {
        $newContent = if ([string]::IsNullOrWhiteSpace($content)) { "$Line`r`n" } else { $content.TrimEnd() + "`r`n" + $Line + "`r`n" }
        Write-Utf8NoBom -Path $Path -Content $newContent
    }
}

function Get-GitFileFromCommit {
    param(
        [Parameter(Mandatory = $true)][string]$Commit,
        [Parameter(Mandatory = $true)][string]$FilePath
    )
    $output = git show "$Commit`:$FilePath" 2>$null
    if ($LASTEXITCODE -ne 0) {
        throw "Could not read $FilePath from commit $Commit"
    }
    return ($output -join "`n")
}

function Remove-BomFromFile {
    param([string]$Path)
    if (Test-Path $Path) {
        $content = Get-Content $Path -Raw
        Write-Utf8NoBom -Path $Path -Content $content
    }
}

function Move-FontImportToTop {
    param([string]$Path)
    if (-not (Test-Path $Path)) { return }
    $content = Get-Content $Path -Raw
    $pattern = "@import\s+url\(['\"]https://fonts\.googleapis\.com[^;]+;"
    $match = [regex]::Match($content, $pattern)
    if ($match.Success) {
        $importLine = $match.Value
        $content = [regex]::Replace($content, [regex]::Escape($importLine), "", 1)
        $content = $importLine + "`r`n`r`n" + $content.TrimStart()
        Write-Utf8NoBom -Path $Path -Content $content
    }
}

if (-not (Test-Path $RepoPath)) {
    throw "RepoPath not found: $RepoPath"
}

Push-Location $RepoPath
try {
    Write-Step "Create safety backup and abort any in-progress rebase"
    $timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
    $backupBranch = "backup-pre-clerk-reset-$timestamp"
    git branch $backupBranch HEAD | Out-Null

    if ((Test-Path ".git\rebase-merge") -or (Test-Path ".git\rebase-apply")) {
        try { git rebase --abort | Out-Host } catch { Write-Host "No rebase to abort or abort failed harmlessly." -ForegroundColor DarkYellow }
    }

    Write-Step "Reset local main to current origin/main"
    git fetch origin | Out-Host
    git switch main | Out-Host
    git reset --hard origin/main | Out-Host

    Write-Step "Create fresh working branch"
    git switch -C $BranchName | Out-Host

    Write-Step "Clean local junk"
    foreach ($path in @(".env.local", "backend\.dev.vars", "backend\.wrangler", "dist", "_auth_patch_backup_20260307-204115")) {
        if (Test-Path $path) {
            Remove-Item -Recurse -Force $path -ErrorAction SilentlyContinue
        }
    }

    Write-Step "Ignore local-only files"
    foreach ($line in @("backend/.dev.vars", "backend/.wrangler/", "_auth_patch_backup_*/")) {
        Ensure-LineInFile -Path ".gitignore" -Line $line
    }
    git rm -r --cached --ignore-unmatch backend/.wrangler | Out-Null

    Write-Step "Restore known-good Clerk files from your local Clerk commit"
    $filesFromCommit = @(
        "src/App.tsx",
        "src/main.tsx",
        "src/hooks/usePortfolio.ts",
        "backend/src/middleware/auth.ts"
    )
    foreach ($file in $filesFromCommit) {
        $content = Get-GitFileFromCommit -Commit $PatchCommit -FilePath $file
        Write-Utf8NoBom -Path $file -Content $content
    }

    Write-Step "Write clean environment example and Worker config"
    $envExample = @'
# Frontend auth, required
VITE_CLERK_PUBLISHABLE_KEY=pk_test_REPLACE_ME

# Frontend API base URL, required
VITE_WORKER_API_URL=https://your-worker-name.your-subdomain.workers.dev

# In Clerk dashboard, enable:
# 1. Email + password
# 2. Google social login
# 3. Microsoft social login
'@
    Write-Utf8NoBom -Path ".env.example" -Content $envExample

    $wranglerToml = @'
name = "cryptotracker-api"
main = "src/index.ts"
compatibility_date = "2025-03-01"
compatibility_flags = ["nodejs_compat"]

[triggers]
crons = ["*/2 * * * *"]

[[d1_databases]]
binding = "DB"
database_name = "crypto-tracker"
database_id = "e51dd932-5912-4a1b-b354-ff03bc25d23e"

[[kv_namespaces]]
binding = "PRICE_KV"
id = "5a8b838fa6fc43578654af2d14674439"
'@
    Write-Utf8NoBom -Path "backend/wrangler.toml" -Content $wranglerToml

    Write-Step "Patch stale Dashboard message if needed"
    $dashboardPath = "src/pages/DashboardPage.tsx"
    if (Test-Path $dashboardPath) {
        $dashboard = Get-Content $dashboardPath -Raw
        $dashboard = $dashboard -replace 'Not logged in — showing local data only\. Sign in to see your Supabase portfolio\.', 'Not signed in — showing local data only. Sign in to sync your portfolio.'
        $dashboard = $dashboard -replace 'Not logged in . showing local data only\. Sign in to see your Supabase portfolio\.', 'Not signed in - showing local data only. Sign in to sync your portfolio.'
        Write-Utf8NoBom -Path $dashboardPath -Content $dashboard
    }

    Write-Step "Fix CSS import ordering"
    Move-FontImportToTop -Path "src/index.css"

    Write-Step "Remove encoding damage from key files"
    foreach ($file in @("src/App.tsx", "src/main.tsx", "src/hooks/usePortfolio.ts", "backend/src/middleware/auth.ts", "backend/wrangler.toml", "src/pages/DashboardPage.tsx")) {
        if (Test-Path $file) {
            $content = Get-Content $file -Raw
            $content = $content -replace 'Ã‚Â·', '·'
            $content = $content -replace 'Â·', '·'
            $content = $content -replace 'Ã¢â‚¬Â¦', '…'
            $content = $content -replace 'Ã¢â‚¬â€', '—'
            $content = $content -replace 'â€”', '—'
            Write-Utf8NoBom -Path $file -Content $content
        }
    }

    Write-Step "Install Clerk React and refresh dependencies"
    npm uninstall @clerk/clerk-react | Out-Host
    npm install @clerk/react | Out-Host

    Write-Step "Write local development env files"
    $envLocal = @"
VITE_CLERK_PUBLISHABLE_KEY=$PublishableKey
VITE_WORKER_API_URL=$WorkerApiUrl
"@
    Write-Utf8NoBom -Path ".env.local" -Content $envLocal.Trim() + "`r`n"

    $devVars = @"
CLERK_JWKS_URL=$ClerkJwksUrl
ALLOWED_ORIGINS=$AllowedOrigins
"@
    Write-Utf8NoBom -Path "backend/.dev.vars" -Content $devVars.Trim() + "`r`n"

    Write-Step "Build frontend"
    npm run build | Out-Host

    if (-not $SkipBackendDeploy) {
        Write-Step "Update Worker secrets and deploy backend"
        Push-Location "backend"
        try {
            $ClerkJwksUrl | npx wrangler secret put CLERK_JWKS_URL | Out-Host
            if (-not [string]::IsNullOrWhiteSpace($AllowedOrigins)) {
                $AllowedOrigins | npx wrangler secret put ALLOWED_ORIGINS | Out-Host
            }
            npx wrangler deploy | Out-Host
        }
        finally {
            Pop-Location
        }
    }

    if (-not $SkipCommit) {
        Write-Step "Commit clean Clerk fix branch"
        git add .gitignore .env.example backend/src/middleware/auth.ts backend/wrangler.toml package.json package-lock.json src/App.tsx src/main.tsx src/hooks/usePortfolio.ts src/index.css src/pages/DashboardPage.tsx | Out-Null
        git add -u backend/.wrangler | Out-Null
        git commit -m "Restore clean Clerk auth flow and Worker config" | Out-Host

        if (-not $SkipPush) {
            git push -u origin $BranchName | Out-Host
        }
    }

    Write-Step "Done"
    Write-Host "Backup branch: $backupBranch" -ForegroundColor Green
    Write-Host "Working branch: $BranchName" -ForegroundColor Green
    Write-Host "Frontend dev URL should use .env.local with Clerk + Worker values." -ForegroundColor Green
}
finally {
    Pop-Location
}
