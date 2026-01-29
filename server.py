from flask import Flask, request, jsonify
from flask_cors import CORS
import sqlite3
import os

app = Flask(__name__)
CORS(app)  # This allows your browser to talk to the Pi

DB_PATH = 'database.db'

def init_db():
    exists = os.path.exists(DB_PATH)
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS rows (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            value TEXT NOT NULL
        )
    ''')
    # Add initial data only if the DB is new
    if not exists:
        cursor.execute("INSERT INTO rows (name, value) VALUES ('Dominick', 'Pelaia')")
        cursor.execute("INSERT INTO rows (name, value) VALUES ('Levi', 'Dunn')")
    conn.commit()
    conn.close()

@app.route('/api/rows', methods=['GET'])
def get_rows():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM rows")
    rows = cursor.fetchall()
    conn.close()
    return jsonify([{'id': r[0], 'name': r[1], 'value': r[2]} for r in rows])

@app.route('/api/rows', methods=['POST'])
def add_row():
    data = request.json
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("INSERT INTO rows (name, value) VALUES (?, ?)", (data['name'], data['value']))
    conn.commit()
    conn.close()
    return jsonify({'status': 'success'}), 201

@app.route('/api/rows/<int:row_id>', methods=['PUT'])
def update_row(row_id):
    data = request.json
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("UPDATE rows SET name = ?, value = ? WHERE id = ?", (data['name'], data['value'], row_id))
    conn.commit()
    conn.close()
    return jsonify({'status': 'success'})

@app.route('/api/rows/<int:row_id>', methods=['DELETE'])
def delete_row(row_id):
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("DELETE FROM rows WHERE id = ?", (row_id,))
    conn.commit()
    conn.close()
    return jsonify({'status': 'success'})

if __name__ == '__main__':
    init_db()
    # Run on All IPs (0.0.0.0) so the phone can find it
    app.run(host='0.0.0.0', port=5000, debug=True)
