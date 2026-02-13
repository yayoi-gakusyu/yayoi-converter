import os
import glob
import zipfile
import shutil

SOURCE_DIR = r"c:\Users\smc232\.gemini\antigravity\scratch\新しいフォルダー"
DEST_DIR = os.path.join(SOURCE_DIR, "2510-2512")

def merge_folders(src, dst):
    if not os.path.exists(dst):
        os.makedirs(dst)
    for item in os.listdir(src):
        s = os.path.join(src, item)
        d = os.path.join(dst, item)
        if os.path.isdir(s):
            merge_folders(s, d) # recurse
        else:
            if os.path.exists(d):
                os.remove(d)
            shutil.move(s, d)
    # Remove empty src
    try:
        os.rmdir(src)
    except Exception as e:
        print(f"Failed to remove {src}: {e}")

if not os.path.exists(DEST_DIR):
    os.makedirs(DEST_DIR)

# Find zips
zips = glob.glob(os.path.join(SOURCE_DIR, "*.zip"))
print(f"Found {len(zips)} zips in {SOURCE_DIR}")
for z in zips:
    print(f" - {z}")

for zip_path in zips:
    print(f"Processing: {zip_path}")
    try:
        with zipfile.ZipFile(zip_path, 'r') as zip_ref:
            # Check encoding fix for Japanese filenames in zip
            # Standard zipfile might use cp437. If filenames are garbled, we might need extra handling.
            # But recent python usually tries to autodetect or uses utf-8 flag. 
            # If filenames are Shift-JIS but flagged as cp437 (common in Windows), we might need to fix names.
            # Let's verify extraction first.
            
            # Metadata-only extraction first to check names? 
            # No, just extract all. If names are garbled on disk, we can fix later.
            zip_ref.extractall(DEST_DIR)
            print(f"Extracted {zip_path}")
    except Exception as e:
        print(f"Failed to extract {zip_path}: {e}")

# Flatten
print("Organizing folders...")
for item in os.listdir(DEST_DIR):
    if item == "__MACOSX":
        print("Removing __MACOSX...")
        try:
            shutil.rmtree(os.path.join(DEST_DIR, item))
        except:
            pass
        continue

    item_path = os.path.join(DEST_DIR, item)
    if os.path.isdir(item_path):
        # Heuristic: If it starts with a digit, it's likely a category folder we want to keep (e.g. 01, 02).
        # If NOT, it's likely the container (garbage name or "月次...").
        if item[0].isdigit():
            continue

        try:
             print(f"Flattening container folder: {item.encode('cp932', 'replace').decode('cp932')}")
        except:
             print(f"Flattening container folder: {repr(item)}")

        sub_items = os.listdir(item_path)
        for sub in sub_items:
            s = os.path.join(item_path, sub)
            d = os.path.join(DEST_DIR, sub)
            
            # Handle collision
            if os.path.exists(d):
                if os.path.isdir(s):
                    print(f"  Merging folder {repr(sub)}...")
                    merge_folders(s, d)
                else:
                    print(f"  Overwriting file {repr(sub)}...")
                    os.remove(d)
                    shutil.move(s, d)
            else:
                try:
                    print(f"  Moving {sub.encode('cp932', 'replace').decode('cp932')}...")
                except:
                    print(f"  Moving {repr(sub)}...")
                shutil.move(s, d)
        
        # Remove empty parent
        try:
            os.rmdir(item_path)
            print(f"  Removed empty container folder")
        except Exception as e:
            print(f"  Could not remove container: {e}")

print("Done")
