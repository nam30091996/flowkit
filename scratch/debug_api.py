import requests
import json
import time

BASE_URL = "http://127.0.0.1:8100"

def debug_full_flow():
    project_id = "28fc643c-7c67-4ee2-93e3-a4d40e0e4afe"
    
    # 1. Generate
    gen_payload = {
        "prompt": "Ghibli style house in the forest, high quality",
        "project_id": project_id,
        "aspect_ratio": "IMAGE_ASPECT_RATIO_LANDSCAPE"
    }
    print(f"Step 1: Generating image...")
    resp = requests.post(f"{BASE_URL}/api/flow/generate-image", json=gen_payload, timeout=60)
    if resp.status_code != 200:
        print(f"Gen failed: {resp.status_code} - {resp.text}")
        return
    
    data = resp.json()
    media_id = None
    # Flexible extraction
    root = data.get("data") or data.get("result") or data
    media_list = root.get("media") or data.get("media")
    if media_list and len(media_list) > 0:
        media_id = media_list[0].get("name") or media_list[0].get("mediaId")
    
    if not media_id:
        print(f"Could not find media_id in: {json.dumps(data, indent=2)}")
        return
        
    print(f"Step 2: Got media_id {media_id}. Waiting 5s for indexing...")
    time.sleep(5)
    
    # 3. Get Media
    print(f"Step 3: Fetching media info for {media_id}...")
    m_resp = requests.get(f"{BASE_URL}/api/flow/media/{media_id}", timeout=30)
    print(f"Status: {m_resp.status_code}")
    print(f"Response: {m_resp.text}")

if __name__ == "__main__":
    debug_full_flow()
