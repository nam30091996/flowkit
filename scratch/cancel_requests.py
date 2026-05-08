import sqlite3

VIDEO_ID = "848dd155-467d-4b11-88d8-301321ff95dc"
DB_FILE = "flow_agent.db"

def cancel():
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()

    cursor.execute("""
        UPDATE request 
        SET status = 'FAILED', error_message = 'Cancelled by user' 
        WHERE video_id = ? AND status IN ('PENDING', 'PROCESSING')
    """, (VIDEO_ID,))
    
    count = cursor.rowcount
    conn.commit()
    conn.close()
    print(f"Cancelled {count} requests.")

if __name__ == "__main__":
    cancel()
