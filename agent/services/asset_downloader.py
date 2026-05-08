"""Service for automatically downloading generated assets to local output directories."""
import aiohttp
import logging
from pathlib import Path
from agent.config import OUTPUT_DIR
from agent.db import crud

logger = logging.getLogger(__name__)

async def auto_download_asset(req: dict, output_url: str):
    """Automatically download and save asset to requested directory based on type."""
    if not output_url:
        return

    req_type = req.get("type", "")
    scene_id = req.get("scene_id")
    character_id = req.get("character_id")
    
    dest_path = None
    
    # 1. Images (Scenes) -> output/image/{display_order}.extension
    if req_type in ("GENERATE_IMAGE", "REGENERATE_IMAGE", "EDIT_IMAGE"):
        if scene_id:
            scene = await crud.get_scene(scene_id)
            if scene:
                display_order = scene.get("display_order", 0)
                ext = _get_extension(output_url, default=".png")
                dest_path = OUTPUT_DIR / "image" / f"{display_order}{ext}"
    
    # 2. Videos -> output/video/{display_order}.extension
    elif req_type in ("GENERATE_VIDEO", "REGENERATE_VIDEO", "GENERATE_VIDEO_REFS", "UPSCALE_VIDEO"):
        if scene_id:
            scene = await crud.get_scene(scene_id)
            if scene:
                display_order = scene.get("display_order", 0)
                dest_path = OUTPUT_DIR / "video" / f"{display_order}.mp4"

    # 3. Reference Images -> output/image/ref/{slug}.extension
    elif req_type in ("GENERATE_CHARACTER_IMAGE", "REGENERATE_CHARACTER_IMAGE", "EDIT_CHARACTER_IMAGE"):
        if character_id:
            char = await crud.get_character(character_id)
            if char:
                slug = char.get("slug") or char.get("name")
                ext = _get_extension(output_url, default=".png")
                dest_path = OUTPUT_DIR / "image" / "ref" / f"{slug}{ext}"

    if dest_path:
        await _download_file(output_url, dest_path)

async def _download_file(url: str, dest: Path):
    """Download file from URL to local path with retry-lite."""
    try:
        dest.parent.mkdir(parents=True, exist_ok=True)
        async with aiohttp.ClientSession() as session:
            async with session.get(url, timeout=aiohttp.ClientTimeout(total=120)) as resp:
                if resp.status == 200:
                    content = await resp.read()
                    dest.write_bytes(content)
                    logger.info("Asset auto-downloaded: %s", dest)
                else:
                    logger.warning("Auto-download failed for %s: HTTP %d", url[:60], resp.status)
    except Exception as e:
        logger.warning("Auto-download error for %s: %s", url[:60], e)

def _get_extension(url: str, default: str) -> str:
    """Extract file extension from URL, handling query params."""
    path = url.split("?")[0]
    if "." in path:
        ext = "." + path.split(".")[-1]
        # Common sanity check for extension length
        if 2 <= len(ext) <= 5:
            return ext.lower()
    return default
