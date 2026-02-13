$root = "c:\Users\smc232\.gemini\antigravity\scratch\新しいフォルダー\2510-2512"
$monthlyFolders = @("月次資料2025年10月", "月次資料2025年11月", "月次資料2025年12月")

foreach ($month in $monthlyFolders) {
    $sourcePath = Join-Path $root $month
    if (Test-Path $sourcePath) {
        $subFolders = Get-ChildItem -Path $sourcePath -Directory
        foreach ($folder in $subFolders) {
            $destPath = Join-Path $root $folder.Name
            Write-Host "Merging $($folder.FullName) to $destPath"
            
            # Use Robocopy for robust merging and moving
            # /E :: copy subdirectories, including Empty ones.
            # /MOVE :: MOVE files AND dirs (delete from source after copying).
            # /IS /IT :: Include Same/Tweaked files (overwrite logic).
            # /NFL /NDL :: No File List / No Directory List (less output).
            # /NJH /NJS :: No Job Header / No Job Summary.
            # Quoting paths is handled by PowerShell invoke if we pass args correctly, but start-process is safer?
            # actually robocopy is simple executable.
            
            $proc = Start-Process -FilePath "robocopy.exe" -ArgumentList "`"$($folder.FullName)`"", "`"$destPath`"", "/E", "/MOVE", "/NFL", "/NDL", "/NJH", "/NJS" -Wait -PassThru
            
            Write-Host "Robocopy exit code: $($proc.ExitCode)"
        }
        
        # Try to remove the monthly folder if empty
        if ((Get-ChildItem -Path $sourcePath).Count -eq 0) {
            Remove-Item -Path $sourcePath -Force
            Write-Host "Removed empty folder: $sourcePath"
        } else {
             Write-Host "Folder not empty, keeping: $sourcePath"
        }
    } else {
        Write-Host "Monthly folder not found: $sourcePath"
    }
}
