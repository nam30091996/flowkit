import sqlite3
import uuid
import json
from datetime import datetime

VIDEO_ID = "848dd155-467d-4b11-88d8-301321ff95dc"
PROMPT_FILE = "imageprompt.txt"
DB_FILE = "flow_agent.db"

def populate():
    with open(PROMPT_FILE, 'r', encoding='utf-8') as f:
        prompts = [line.strip() for line in f if line.strip()]

    print(f"Found {len(prompts)} prompts.")

    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()

    scene_ids = []
    now = datetime.utcnow().isoformat() + "Z"

    for i, prompt in enumerate(prompts):
        sid = str(uuid.uuid4())
        scene_ids.append(sid)
        
        # Prepare character_names - extract from prompt if possible, but for now empty list is fine
        # since the prompt is complete.
        char_names = json.dumps([]) 
        
        cursor.execute("""
            INSERT INTO scene (
                id, video_id, display_order, prompt, chain_type, source, 
                character_names, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            sid, VIDEO_ID, i, prompt, "ROOT", "user",
            char_names, now, now
        ))

    conn.commit()
    conn.close()
    print(f"Successfully inserted {len(scene_ids)} scenes.")
    
    # Save scene IDs to a scratch file for batch request creation
    with open('scratch/scene_ids.json', 'w') as f:
        json.dump(scene_ids, f)

if __name__ == "__main__":
    populate()
