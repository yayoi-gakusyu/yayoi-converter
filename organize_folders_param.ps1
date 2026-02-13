param (
    [string]$RootPath
)

Write-Host "Usage: Organize contents of monthly folders into root categories."
Write-Host "Target Root: $RootPath"

if (-not (Test-Path $RootPath)) {
    Write-Error "Root path does not exist: $RootPath"
    exit 1
}

# Find folders dynamically matching *2025* (e.g., 月次資料2025年10月)
$monthlyFolders = Get-ChildItem -Path $RootPath -Directory | Where-Object { $_.Name -like "*2025*" }

if ($monthlyFolders.Count -eq 0) {
    Write-Warning "No monthly folders found matching '*2025*' in $RootPath"
    # List what IS there for debugging
    Get-ChildItem -Path $RootPath | Select-Object Name
}

foreach ($monthFolder in $monthlyFolders) {
    Write-Host "Processing monthly folder: $($monthFolder.Name)"
    $sourcePath = $monthFolder.FullName
    
    $subFolders = Get-ChildItem -Path $sourcePath -Directory
    foreach ($folder in $subFolders) {
        # Destination is Root/FolderName
        $destPath = Join-Path $RootPath $folder.Name
        Write-Host "  Merging $($folder.Name) -> $destPath"
        
        # Create destination if not exists (Robocopy does this, but good to be sure? No, robocopy handles it)
        # Using Robocopy
        # /E :: copy subdirs
        # /MOVE :: move files and dirs
        # /IS /IT :: Include Same/Tweaked
        $proc = Start-Process -FilePath "robocopy.exe" -ArgumentList "`"$($folder.FullName)`"", "`"$destPath`"", "/E", "/MOVE", "/NFL", "/NDL", "/NJH", "/NJS" -Wait -PassThru
        
        Write-Host "  Robocopy exit code: $($proc.ExitCode)"
    }
    
    # Remove monthly folder if empty
    if ((Get-ChildItem -Path $sourcePath).Count -eq 0) {
        Remove-Item -Path $sourcePath -Force
        Write-Host "  Removed empty folder: $($monthFolder.Name)"
    }
    else {
        Write-Host "  Folder not empty, keeping: $($monthFolder.Name)"
    }
    Write-Host "--------------------------------"
}
