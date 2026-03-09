# Add Python, Scripts, and CUDA (for PyTorch GPU) to user PATH
# Run: Right-click -> Run with PowerShell, or: powershell -ExecutionPolicy Bypass -File add_python_to_path.ps1

$pathsToAdd = @()

# --- Python ---
$pythonExe = $null
foreach ($cmd in @('python', 'python3', 'py')) {
    try {
        $found = Get-Command $cmd -ErrorAction SilentlyContinue
        if ($found) {
            $pythonExe = $found.Source
            break
        }
    } catch {}
}

# Fallback: check common install locations
if (-not $pythonExe) {
    $locations = @(
        "$env:LOCALAPPDATA\Programs\Python\Python*\python.exe",
        "$env:APPDATA\Local\Programs\Python\Python*\python.exe"
    )
    foreach ($pattern in $locations) {
        $matches = Get-Item $pattern -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending
        if ($matches) {
            $pythonExe = $matches[0].FullName
            break
        }
    }
}

if (-not $pythonExe) {
    Write-Host "Python not found. Install Python from python.org and run this script again." -ForegroundColor Red
    exit 1
}

$pythonDir = Split-Path $pythonExe -Parent
$scriptsDir = Join-Path $pythonDir "Scripts"
$pathsToAdd += $pythonDir
if (Test-Path $scriptsDir) { $pathsToAdd += $scriptsDir }

# --- CUDA (for PyTorch GPU) ---
$cudaBase = "C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA"
if (Test-Path $cudaBase) {
    $cudaVersions = Get-ChildItem $cudaBase -Directory -ErrorAction SilentlyContinue | Sort-Object Name -Descending
    foreach ($ver in $cudaVersions) {
        $cudaBin = Join-Path $ver.FullName "bin"
        if (Test-Path $cudaBin) {
            $pathsToAdd += $cudaBin
            break  # use latest CUDA version only
        }
    }
}

$currentPath = [Environment]::GetEnvironmentVariable("Path", "User")
$added = $false
foreach ($p in $pathsToAdd) {
    if ($currentPath -notlike "*$p*") {
        $currentPath = "$currentPath;$p"
        $added = $true
    }
}

if ($added) {
    [Environment]::SetEnvironmentVariable("Path", $currentPath, "User")
    Write-Host "Added to PATH:" -ForegroundColor Green
    $pathsToAdd | ForEach-Object { Write-Host "  $_" }
    Write-Host "Restart the Electron app (and any open terminals) for changes to take effect." -ForegroundColor Yellow
} else {
    Write-Host "Python and CUDA already in PATH." -ForegroundColor Green
}
