$root = "c:\Users\smc232\.gemini\antigravity\scratch\新しいフォルダー\2510-2512"

# Find folders dynamically to avoid encoding issues with hardcoded Japanese strings
# Matches "月次資料2025年..."
$monthlyFolders = Get-ChildItem -Path $root -Directory | Where-Object { $_.Name -like "*2025*" }

foreach ($monthFolder in $monthlyFolders) {
    Write-Host "Processing monthly folder: $($monthFolder.Name)"
    $sourcePath = $monthFolder.FullName
    
    $subFolders = Get-ChildItem -Path $sourcePath -Directory
    foreach ($folder in $subFolders) {
        $destPath = Join-Path $root $folder.Name
        Write-Host "  Merging $($folder.Name) -> $destPath"
        
        # Robocopy
        # /E :: copy subdirectories, including Empty ones.
        # /MOVE :: MOVE files AND dirs (delete from source after copying).
        $proc = Start-Process -FilePath "robocopy.exe" -ArgumentList "`"$($folder.FullName)`"", "`"$destPath`"", "/E", "/MOVE", "/NFL", "/NDL", "/NJH", "/NJS" -Wait -PassThru
        
        Write-Host "  Robocopy exit code: $($proc.ExitCode)"
    }
    
    # Try to remove the monthly folder if empty
    if ((Get-ChildItem -Path $sourcePath).Count -eq 0) {
        Remove-Item -Path $sourcePath -Force
        Write-Host "  Removed empty folder: $($monthFolder.Name)"
    }
    else {
        Write-Host "  Folder not empty, keeping: $($monthFolder.Name)"
    }
    Write-Host "--------------------------------"
}
