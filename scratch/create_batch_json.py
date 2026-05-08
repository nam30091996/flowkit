import json

PROJECT_ID = "357819ac-e847-4c31-a4cc-1ff73b2804b7"
VIDEO_ID = "848dd155-467d-4b11-88d8-301321ff95dc"

with open('scratch/scene_ids.json', 'r') as f:
    scene_ids = json.load(f)

batch_request = {
    "requests": [
        {
            "type": "GENERATE_IMAGE",
            "scene_id": sid,
            "project_id": PROJECT_ID,
            "video_id": VIDEO_ID,
            "orientation": "HORIZONTAL"
        }
        for sid in scene_ids
    ]
}

with open('scratch/batch_request.json', 'w') as f:
    json.dump(batch_request, f)

print(f"Created batch request with {len(batch_request['requests'])} items.")
