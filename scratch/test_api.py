import requests
import json

BASE_URL = "http://127.0.0.1:8100"

def test_generate():
    payload = {
        "prompt": "A beautiful landscape, studio ghibli style",
        "project_id": "28fc643c-7c67-4ee2-93e3-a4d40e0e4afe",
        "aspect_ratio": "IMAGE_ASPECT_RATIO_LANDSCAPE"
    }
    
    print("Testing /api/flow/generate-image...")
    try:
        resp = requests.post(f"{BASE_URL}/api/flow/generate-image", json=payload, timeout=60)
        print(f"Status: {resp.status_code}")
        print("Response Body:")
        data = resp.json()
        print(json.dumps(data, indent=2))
        
        # Test extraction
        root = data.get("data") or data.get("result") or data
        media = root.get("media")
        if media and isinstance(media, list) and len(media) > 0:
            media_item = media[0]
        else:
            media_item = root
            
        imageUrl = media_item.get("fifeUrl") or media_item.get("servingUri") or media_item.get("url")
        print(f"\nExtracted URL: {imageUrl}")
        
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    test_generate()
