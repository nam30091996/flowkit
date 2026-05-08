import sqlite3
import json

db_path = "flow_agent.db"
try:
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    cursor.execute("SELECT id, name FROM project")
    projects = [dict(row) for row in cursor.fetchall()]
    print(json.dumps(projects, indent=2))
    conn.close()
except Exception as e:
    print(f"Error: {e}")
