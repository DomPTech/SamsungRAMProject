from flask import Flask, request, jsonify
from flask_cors import CORS
import sqlite3
import os
import ssl

app = Flask(__name__)
CORS(app)

DB_PATH = 'database.db'

# Denture steps
STEPS = [
    "Operatory",
    "Design/CAD",
    "3D Printing/Post-Processing"
]

def init_db():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    # Migration: Drop old table if needed or just add new one
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS dentures (
            serial_number TEXT PRIMARY KEY,
            patient_name TEXT DEFAULT 'Patient',
            step_index INTEGER DEFAULT 0,
            last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    conn.commit()
    conn.close()

@app.route('/api/dentures', methods=['GET'])
def get_dentures():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("SELECT serial_number, patient_name, step_index, last_updated FROM dentures ORDER BY last_updated DESC")
    rows = cursor.fetchall()
    conn.close()
    
    dentures = [{
        'serial': r[0],
        'patient': r[1],
        'step_index': r[2],
        'step_name': STEPS[min(r[2], len(STEPS)-1)],
        'updated': r[3]
    } for r in rows]
    
    return jsonify({
        'dentures': dentures,
        'steps': STEPS
    })

@app.route('/api/scan', methods=['POST'])
def scan_tag():
    data = request.json
    serial = data.get('serialNumber')
    if not serial:
        return jsonify({'error': 'Missing serialNumber'}), 400
    
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    # Check if denture exists
    cursor.execute("SELECT step_index FROM dentures WHERE serial_number = ?", (serial,))
    row = cursor.fetchone()
    
    if row:
        # Increment step
        new_step = row[0] + 1
        cursor.execute("UPDATE dentures SET step_index = ?, last_updated = CURRENT_TIMESTAMP WHERE serial_number = ?", (new_step, serial))
        status = 'updated'
    else:
        # Create new entry
        cursor.execute("INSERT INTO dentures (serial_number, step_index) VALUES (?, 0)", (serial,))
        status = 'created'
        new_step = 0
        
    conn.commit()
    conn.close()
    
    return jsonify({
        'status': status,
        'step_index': new_step,
        'step_name': STEPS[min(new_step, len(STEPS)-1)]
    }), 201

@app.route('/api/dentures/<serial>', methods=['DELETE'])
def delete_denture(serial):
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("DELETE FROM dentures WHERE serial_number = ?", (serial,))
    conn.commit()
    conn.close()
    return jsonify({'status': 'success'})

if __name__ == '__main__':
    init_db()
    
    # Create self-signed SSL context for HTTPS
    # Note: Browsers will show a warning about self-signed cert
    # You'll need to accept it once
    context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    context.check_hostname = False
    context.verify_mode = ssl.CERT_NONE
    
    # Generate certificate if it doesn't exist
    cert_file = 'cert.pem'
    key_file = 'key.pem'
    
    if not os.path.exists(cert_file) or not os.path.exists(key_file):
        print("📝 Generating self-signed certificate...")
        os.system(f'openssl req -x509 -newkey rsa:4096 -nodes -out {cert_file} -keyout {key_file} -days 365 -subj "/CN=localhost"')
        print("✅ Certificate generated!\n")
    
    context.load_cert_chain(cert_file, key_file)
    
    port = 5001
    print(f"\n🔒 HTTPS Server starting on https://0.0.0.0:{port}")
    print(f"📱 Access from your network using your computer's IP address")
    print(f"⚠️  You may need to accept the security warning in your browser\n")
    
    # Run on All IPs (0.0.0.0) with HTTPS
    app.run(host='0.0.0.0', port=port, ssl_context=context, debug=True)
