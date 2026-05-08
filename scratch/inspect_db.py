import sqlite3
import json

def get_db_info():
    conn = sqlite3.connect('flow_agent.db')
    cursor = conn.cursor()
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
    tables = [row[0] for row in cursor.fetchall()]
    print(f"Tables: {tables}")
    
    for table in tables:
        try:
            cursor.execute(f"SELECT * FROM {table} LIMIT 1")
            columns = [description[0] for description in cursor.description]
            print(f"Table {table} columns: {columns}")
        except Exception as e:
            print(f"Error reading table {table}: {e}")
    
    print("\nSearching for project '0506'...")
    cursor.execute("SELECT id, name, material FROM project WHERE name LIKE '%0506%'")
    projects = cursor.fetchall()
    print(f"Projects found: {projects}")

    print("\nListing materials...")
    cursor.execute("SELECT name FROM material")
    materials = [row[0] for row in cursor.fetchall()]
    print(f"Materials: {materials}")
            
    conn.close()

if __name__ == "__main__":
    get_db_info()
