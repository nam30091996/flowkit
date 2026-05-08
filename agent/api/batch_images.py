import asyncio
import aiohttp
import os
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from concurrent.futures import ThreadPoolExecutor

executor = ThreadPoolExecutor(max_workers=1)
router = APIRouter(prefix="/batch-images", tags=["batch-images"])

class SaveImageRequest(BaseModel):
    url: str
    save_path: str

@router.post("/save")
async def save_image(body: SaveImageRequest):
    """Download image from URL and save to local path."""
    try:
        # Create directory if it doesn't exist
        os.makedirs(os.path.dirname(body.save_path), exist_ok=True)
        
        connector = aiohttp.TCPConnector(ssl=False)
        async with aiohttp.ClientSession(connector=connector) as session:
            async with session.get(body.url) as resp:
                if resp.status == 200:
                    content = await resp.read()
                    with open(body.save_path, "wb") as f:
                        f.write(content)
                    return {"ok": True, "path": body.save_path}
                else:
                    raise HTTPException(502, f"Failed to download image: HTTP {resp.status}")
    except Exception as e:
        raise HTTPException(500, str(e))

import subprocess

def _ask_directory():
    """Use PowerShell with OpenFileDialog trick to show a modern folder picker.
    Uses Base64 encoding for output to avoid console encoding issues with non-ASCII characters.
    """
    ps_script = (
        "Add-Type -AssemblyName System.Windows.Forms; "
        "$f = New-Object System.Windows.Forms.OpenFileDialog; "
        "$f.ValidateNames = $false; "
        "$f.CheckFileExists = $false; "
        "$f.CheckPathExists = $true; "
        "$f.FileName = 'Select Folder'; "
        "$f.Title = 'Select Output Directory'; "
        "if($f.ShowDialog() -eq 'OK') { "
        "  $p = [System.IO.Path]::GetDirectoryName($f.FileName); "
        "  [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($p)) "
        "}"
    )
    try:
        proc = subprocess.run(
            ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", ps_script],
            capture_output=True,
            text=True,
            check=True,
            timeout=60
        )
        import base64
        import unicodedata
        
        b64_path = proc.stdout.strip()
        if not b64_path:
            return ""
            
        # Decode base64 UTF-8 string from PowerShell
        path = base64.b64decode(b64_path).decode('utf-8')
        # Ensure NFC normalization for Windows compatibility
        path = unicodedata.normalize('NFC', path)
        return path
    except Exception as e:
        print(f"PowerShell picker failed: {e}")
        return ""

@router.get("/pick-dir")
async def pick_directory():
    """Open a native OS folder picker via PowerShell and return the selected path."""
    loop = asyncio.get_event_loop()
    path = await loop.run_in_executor(executor, _ask_directory)
    return {"path": path}
