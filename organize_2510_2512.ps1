$sourceDir = "c:\Users\smc232\.gemini\antigravity\scratch\新しいフォルダー"
$destDir = "c:\Users\smc232\.gemini\antigravity\scratch\新しいフォルダー\2510-2512"

# 1. Create Destination
if (-not (Test-Path $destDir)) {
    New-Item -ItemType Directory -Force -Path $destDir | Out-Null
    Write-Host "Created directory: $destDir"
}

# 2. Extract Zips
Write-Host "Listing files in $sourceDir :"
Get-ChildItem -Path $sourceDir | Select-Object Name | Write-Host

# Encoding safe approach: Find ALL zips, then filter by date (latest) or just process them.
# Given the user context, these are likely the only zips relevant or we can ask the user.
# But "月次資料" (Monthly Data) is the key.
$zips = Get-ChildItem -Path $sourceDir -Filter "*.zip"

if ($zips.Count -eq 0) {
    Write-Host "No zip files found!"
    exit
}

# Sort by LastWriteTime to extract older first, then newer.
$zips = $zips | Sort-Object LastWriteTime

foreach ($zip in $zips) {
    Write-Host "Found zip: $($zip.Name)"
    # Double check if it looks like our target (approximate match on size or naming pattern if possible)
    # The garbled output suggests "25...10...12..." pattern.
    
    Write-Host "Extracting $($zip.Name)..."
    try {
        Expand-Archive -LiteralPath $zip.FullName -DestinationPath $destDir -Force -ErrorAction Stop
    }
    catch {
        Write-Error "Failed to extract $($zip.Name): $_"
    }
}

# 3. Organize (Flatten)
Write-Host "Organizing folders..."
# Look for subdirectories that were just extracted
$subDirs = Get-ChildItem -Path $destDir -Directory

foreach ($dir in $subDirs) {
    # Only process if it looks like a month folder or container (not the categories we just made)
    # The categories start with digits like "01 ", "02 "
    if ($dir.Name -match "^\d{2}\s") {
        # This is already a category folder, skip it
        continue
    }

    Write-Host "Processing potential monthly folder: $($dir.Name)"
    
    $children = Get-ChildItem -Path $dir.FullName -Directory
    if ($children.Count -gt 0) {
        foreach ($child in $children) {
            $targetPath = Join-Path $destDir $child.Name
            
            Write-Host "  Merging $($child.Name) -> $targetPath"
            
            # Use Robocopy for robust move/merge
            # /E :: copy subdirectories, including Empty ones.
            # /MOVE :: MOVE files AND dirs (delete from source after copying).
            # /IS /IT :: Include Same/Tweaked files to ensure overwrite/merge behavior if needed? 
            # Robocopy's default is to merge.
            Start-Process -FilePath "robocopy.exe" -ArgumentList "`"$($child.FullName)`"", "`"$targetPath`"", "/E", "/MOVE", "/NFL", "/NDL", "/NJH", "/NJS" -Wait
        }
        
        # Check if empty now
        if ((Get-ChildItem -Path $dir.FullName).Count -eq 0) {
            Remove-Item -Path $dir.FullName -Force
            Write-Host "  Removed empty folder: $($dir.Name)"
        }
        else {
            Write-Host "  Folder not empty, keeping: $($dir.Name)"
        }
    }
}

Write-Host "Organization complete."
