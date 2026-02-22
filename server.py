from flask import Flask, request, jsonify
from flask_cors import CORS
import sqlite3
import os
import ssl
import bcrypt
import jwt
import datetime
from functools import wraps

app = Flask(__name__, static_folder='static', static_url_path='')
CORS(app)

DB_PATH = os.environ.get('DATABASE_PATH', 'database.db')

DEFAULT_STEPS = [
    "Operatory",
    "Design/CAD",
    "3D Printing/Post-Processing"
]

def get_stages_from_db(conn):
    cursor = conn.cursor()
    cursor.execute('SELECT id, name, ordering FROM stages ORDER BY ordering ASC')
    rows = cursor.fetchall()
    return [{'id': r[0], 'name': r[1], 'ordering': r[2]} for r in rows]

def init_db():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS dentures (
            serial_number TEXT PRIMARY KEY,
            patient_name TEXT DEFAULT 'Patient',
            step_index INTEGER DEFAULT 0,
            last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    conn.commit()
    
    # Stages table (configurable steps)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS stages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            ordering INTEGER NOT NULL
        )
    ''')

    # Users table for admin
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL
        )
    ''')

    # Seed default stages if empty
    cursor.execute('SELECT COUNT(1) FROM stages')
    count = cursor.fetchone()[0]
    if count == 0:
        for idx, name in enumerate(DEFAULT_STEPS):
            cursor.execute('INSERT INTO stages (name, ordering) VALUES (?, ?)', (name, idx))

    conn.commit()
    conn.close()

    # Seed admin user from environment variables if provided and no users exist
    admin_user = os.environ.get('ADMIN_USER')
    admin_pass = os.environ.get('ADMIN_PASS')
    if admin_user and admin_pass:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute('SELECT COUNT(1) FROM users')
        if cursor.fetchone()[0] == 0:
            pw_hash = bcrypt.hashpw(admin_pass.encode(), bcrypt.gensalt()).decode()
            cursor.execute('INSERT INTO users (username, password_hash) VALUES (?, ?)', (admin_user, pw_hash))
            conn.commit()
        conn.close()

# JWT secret for admin tokens
JWT_SECRET = os.environ.get('JWT_SECRET', 'change-this-secret')

def require_auth(f):
    @wraps(f)
    def wrapped(*args, **kwargs):
        auth = request.headers.get('Authorization', '')
        if not auth.startswith('Bearer '):
            return jsonify({'error': 'Unauthorized'}), 401
        token = auth.split(' ', 1)[1]
        try:
            payload = jwt.decode(token, JWT_SECRET, algorithms=['HS256'])
            request.user = payload.get('sub')
        except Exception:
            return jsonify({'error': 'Unauthorized'}), 401
        return f(*args, **kwargs)
    return wrapped

@app.route('/api/dentures', methods=['GET'])
def get_dentures():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("SELECT serial_number, patient_name, step_index, last_updated FROM dentures ORDER BY last_updated DESC")
    rows = cursor.fetchall()
    # Load stages from DB to provide step names
    stages = get_stages_from_db(conn)
    conn.close()

    dentures = [{
        'serial': r[0],
        'patient': r[1],
        'step_index': r[2],
        'step_name': stages[min(r[2], max(0, len(stages)-1))]['name'] if stages else None,
        'updated': r[3]
    } for r in rows]

    return jsonify({
        'dentures': dentures,
        'steps': stages
    })

@app.route('/api/scan', methods=['POST'])
def scan_tag():
    data = request.json
    serial = data.get('serialNumber')
    if not serial:
        return jsonify({'error': 'Missing serialNumber'}), 400
    
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    # Load current stages to determine max index
    stages = get_stages_from_db(conn)
    max_index = max(0, len(stages)-1)

    # Check if denture exists
    cursor.execute("SELECT step_index FROM dentures WHERE serial_number = ?", (serial,))
    row = cursor.fetchone()

    if row:
        # Increment step, but don't exceed max_index
        new_step = min(row[0] + 1, max_index)
        cursor.execute("UPDATE dentures SET step_index = ?, last_updated = CURRENT_TIMESTAMP WHERE serial_number = ?", (new_step, serial))
        status = 'updated'
    else:
        # Create new entry
        cursor.execute("INSERT INTO dentures (serial_number, step_index) VALUES (?, 0)", (serial,))
        status = 'created'
        new_step = 0

    conn.commit()
    conn.close()

    step_name = None
    if stages:
        step_name = stages[min(new_step, max_index)]['name']

    return jsonify({
        'status': status,
        'step_index': new_step,
        'step_name': step_name
    }), 201


@app.route('/api/stages', methods=['GET'])
def list_stages():
    conn = sqlite3.connect(DB_PATH)
    stages = get_stages_from_db(conn)
    conn.close()
    return jsonify({'stages': stages})


# Serve static files (index.html and other assets) from repo root
@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def serve_static(path):
    if path == '':
        path = 'index.html'
    try:
        return app.send_static_file(path)
    except Exception:
        return jsonify({'error': 'Not found'}), 404


@app.route('/api/stages', methods=['POST'])
@require_auth
def create_stage():
    data = request.json or {}
    name = data.get('name')
    if not name:
        return jsonify({'error': 'Missing stage name'}), 400

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute('SELECT COALESCE(MAX(ordering), -1) FROM stages')
    max_order = cursor.fetchone()[0] or -1
    new_order = max_order + 1
    cursor.execute('INSERT INTO stages (name, ordering) VALUES (?, ?)', (name, new_order))
    conn.commit()
    stages = get_stages_from_db(conn)
    conn.close()
    return jsonify({'stages': stages}), 201



@app.route('/api/stages/<int:stage_id>', methods=['PUT'])
@require_auth
def update_stage(stage_id):
    data = request.json or {}
    name = data.get('name')
    ordering = data.get('ordering')

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    # Update name if provided
    if name is not None:
        cursor.execute('UPDATE stages SET name = ? WHERE id = ?', (name, stage_id))
    # Update ordering if provided
    if ordering is not None:
        cursor.execute('UPDATE stages SET ordering = ? WHERE id = ?', (ordering, stage_id))
    conn.commit()
    stages = get_stages_from_db(conn)
    conn.close()
    return jsonify({'stages': stages})


@app.route('/api/stages/<int:stage_id>', methods=['DELETE'])
@require_auth
def delete_stage(stage_id):
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute('DELETE FROM stages WHERE id = ?', (stage_id,))
    conn.commit()
    stages = get_stages_from_db(conn)
    conn.close()
    return jsonify({'stages': stages})


@app.route('/api/auth/login', methods=['POST'])
def login():
    data = request.json or {}
    username = data.get('username')
    password = data.get('password')
    if not username or not password:
        return jsonify({'error': 'Missing credentials'}), 400

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute('SELECT password_hash FROM users WHERE username = ?', (username,))
    row = cursor.fetchone()
    conn.close()

    if not row:
        return jsonify({'error': 'Invalid credentials'}), 401

    stored_hash = row[0]
    if not bcrypt.checkpw(password.encode(), stored_hash.encode()):
        return jsonify({'error': 'Invalid credentials'}), 401

    token = jwt.encode({'sub': username, 'exp': datetime.datetime.utcnow() + datetime.timedelta(hours=8)}, JWT_SECRET, algorithm='HS256')
    return jsonify({'token': token})

@app.route('/api/dentures/<serial>', methods=['DELETE'])
@require_auth
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
