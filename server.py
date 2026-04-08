from flask import Flask, request, jsonify
from flask_cors import CORS
import sqlite3
import os
import ssl
import bcrypt
import jwt
import datetime
import re
from pathlib import Path
from functools import wraps
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent
ENV_PATH = BASE_DIR / '.env'
dotenv_loaded = load_dotenv(ENV_PATH)

print(f"[startup] dotenv path={ENV_PATH} exists={ENV_PATH.exists()} loaded={dotenv_loaded}")
print(
    "[startup] admin env present "
    f"ADMIN_USER={bool(os.environ.get('ADMIN_USER'))} "
    f"ADMIN_PASS={bool(os.environ.get('ADMIN_PASS'))}"
)

app = Flask(__name__, static_folder='static', static_url_path='')
CORS(app)

DB_PATH = os.environ.get('DATABASE_PATH', 'data/database.db')

DEFAULT_STEPS = [
    "Operatory",
    "Design/CAD",
    "3D Printing/Post-Processing"
]


def generate_patient_id(length=6):
    import secrets
    alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
    return ''.join(secrets.choice(alphabet) for _ in range(length))


def normalize_patient_name(patient_name, patient_id):
    import re
    base_name = (patient_name or '').strip()
    normalized_id = str(patient_id or '').strip().upper()
    base_name = re.sub(r'(?:\s*\(ID:\s*e:[^)]+\)\s*)+$', '', base_name, flags=re.IGNORECASE).strip()
    base_name = re.sub(r'(?:\s*\(ID-[^)]+\)\s*)+$', '', base_name, flags=re.IGNORECASE).strip()

    if not base_name:
        base_name = 'Patient'

    return f'{base_name} (ID: e:{normalized_id})'

def get_stages_from_db(conn):
    cursor = conn.cursor()
    cursor.execute('SELECT id, name, ordering FROM stages ORDER BY ordering ASC')
    rows = cursor.fetchall()
    return [{'id': r[0], 'name': r[1], 'ordering': r[2]} for r in rows]

def init_db():
    # Ensure data directory exists
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS dentures (
            serial_number TEXT PRIMARY KEY,
            patient_id TEXT,
            patient_name TEXT DEFAULT 'Patient',
            step_index INTEGER DEFAULT 0,
            last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')

    # Backfill patient_id for older databases that predate the column.
    cursor.execute("PRAGMA table_info(dentures)")
    columns = [row[1] for row in cursor.fetchall()]
    if 'patient_id' not in columns:
        cursor.execute('ALTER TABLE dentures ADD COLUMN patient_id TEXT')

    cursor.execute('SELECT serial_number, patient_id, patient_name FROM dentures')
    for serial_number, existing_patient_id, patient_name in cursor.fetchall():
        normalized_patient_id = (existing_patient_id or '').strip().upper()

        if not re.fullmatch(r'[A-Z0-9]{4,10}', normalized_patient_id or ''):
            current_match = re.search(r'\(ID:\s*e:([A-Z0-9]{4,10})\)\s*$', patient_name or '', flags=re.IGNORECASE)
            legacy_match = re.search(r'\(ID-([A-Z0-9]{4,10})\)\s*$', patient_name or '', flags=re.IGNORECASE)
            if current_match:
                normalized_patient_id = current_match.group(1).upper()
            elif legacy_match:
                normalized_patient_id = legacy_match.group(1).upper()
            else:
                normalized_patient_id = generate_patient_id()

        normalized_patient_name = normalize_patient_name(patient_name, normalized_patient_id)

        if normalized_patient_id != (existing_patient_id or '') or normalized_patient_name != (patient_name or ''):
            cursor.execute(
                'UPDATE dentures SET patient_id = ?, patient_name = ? WHERE serial_number = ?',
                (normalized_patient_id, normalized_patient_name, serial_number)
            )
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

    # Sync admin user from environment variables at startup.
    admin_user = os.environ.get('ADMIN_USER')
    admin_pass = os.environ.get('ADMIN_PASS')
    if admin_user and admin_pass:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        pw_hash = bcrypt.hashpw(admin_pass.encode(), bcrypt.gensalt()).decode()

        # Use the oldest user row as canonical admin account and keep it synced.
        cursor.execute('SELECT id, username FROM users ORDER BY id ASC LIMIT 1')
        existing_admin = cursor.fetchone()

        if existing_admin:
            cursor.execute(
                'UPDATE users SET username = ?, password_hash = ? WHERE id = ?',
                (admin_user, pw_hash, existing_admin[0])
            )
            print(
                '[startup] admin sync result '
                f'updated=True user_id={existing_admin[0]} '
                f'username_changed={existing_admin[1] != admin_user}'
            )
        else:
            cursor.execute('INSERT INTO users (username, password_hash) VALUES (?, ?)', (admin_user, pw_hash))
            print('[startup] admin sync result inserted=True user_id=new')

        conn.commit()
        conn.close()
    else:
        print('[startup] admin sync skipped missing ADMIN_USER or ADMIN_PASS')

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
@require_auth
def scan_tag():
    data = request.json or {}
    serial = data.get('serialNumber')
    patient_id = (data.get('patientId') or '').strip().upper()
    if not serial:
        return jsonify({'error': 'Missing serialNumber'}), 400
    
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    # Load current stages to determine max index
    stages = get_stages_from_db(conn)
    max_index = max(0, len(stages)-1)

    # Check if denture exists
    cursor.execute("SELECT step_index, patient_id, patient_name FROM dentures WHERE serial_number = ?", (serial,))
    row = cursor.fetchone()

    if row:
        # If tray already reached final stage, remove it from active queue.
        if row[0] >= max_index:
            cursor.execute("DELETE FROM dentures WHERE serial_number = ?", (serial,))
            status = 'reset'
            new_step = 0
        else:
            # Increment step, but don't exceed max_index
            new_step = min(row[0] + 1, max_index)
            cursor.execute("UPDATE dentures SET step_index = ?, last_updated = CURRENT_TIMESTAMP WHERE serial_number = ?", (new_step, serial))
            status = 'updated'
    else:
        # Create new entry and preserve a stable patient identifier when provided.
        inferred_patient_id = patient_id or generate_patient_id()
        inferred_patient_name = normalize_patient_name('Patient', inferred_patient_id)
        cursor.execute(
            "INSERT INTO dentures (serial_number, patient_id, patient_name, step_index) VALUES (?, ?, ?, 0)",
            (serial, inferred_patient_id, inferred_patient_name)
        )
        status = 'created'
        new_step = 0

    conn.commit()
    conn.close()

    step_name = None
    if stages and status != 'reset':
        step_name = stages[min(new_step, max_index)]['name']

    return jsonify({
        'status': status,
        'step_index': new_step,
        'step_name': step_name
    }), 201


@app.route('/api/dentures/register', methods=['POST'])
@require_auth
def register_denture():
    data = request.json or {}
    serial = data.get('serialNumber')
    patient_name = (data.get('patientName') or '').strip()
    patient_id = (data.get('patientId') or '').strip().upper()

    if not serial:
        return jsonify({'error': 'Missing serialNumber'}), 400
    if not patient_name:
        return jsonify({'error': 'Missing patientName'}), 400

    if not patient_id:
        patient_id = generate_patient_id()

    normalized_name = normalize_patient_name(patient_name, patient_id)

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute('''
        INSERT INTO dentures (serial_number, patient_id, patient_name, step_index)
        VALUES (?, ?, ?, 0)
        ON CONFLICT(serial_number) DO UPDATE SET
            patient_id = excluded.patient_id,
            patient_name = excluded.patient_name,
            step_index = 0,
            last_updated = CURRENT_TIMESTAMP
    ''', (serial, patient_id, normalized_name))
    conn.commit()
    conn.close()

    return jsonify({'status': 'registered', 'serial': serial, 'patient': normalized_name, 'patientId': patient_id, 'step_index': 0}), 200


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


@app.route('/api/dentures/<serial>', methods=['PUT'])
@require_auth
def update_denture(serial):
    data = request.json or {}
    patient_name = data.get('patientName')
    patient_id = data.get('patientId')
    step_index = data.get('stepIndex')

    if patient_name is None and patient_id is None and step_index is None:
        return jsonify({'error': 'No update fields provided'}), 400

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    cursor.execute('SELECT serial_number, patient_id, patient_name FROM dentures WHERE serial_number = ?', (serial,))
    existing = cursor.fetchone()
    if not existing:
        conn.close()
        return jsonify({'error': 'Entry not found'}), 404

    existing_patient_id = str(existing[1] or '').strip().upper()
    existing_patient_name = str(existing[2] or 'Patient').strip()

    if not re.fullmatch(r'[A-Z0-9]{4,10}', existing_patient_id or ''):
        existing_patient_id = generate_patient_id()

    resolved_patient_id = existing_patient_id
    resolved_patient_name_input = existing_patient_name

    if patient_name is not None:
        cleaned_name = str(patient_name).strip()
        if not cleaned_name:
            conn.close()
            return jsonify({'error': 'patientName cannot be empty'}), 400
        resolved_patient_name_input = cleaned_name

    if patient_id is not None:
        cleaned_patient_id = str(patient_id).strip().upper()
        if not cleaned_patient_id:
            conn.close()
            return jsonify({'error': 'patientId cannot be empty'}), 400
        resolved_patient_id = cleaned_patient_id

    resolved_patient_name = normalize_patient_name(resolved_patient_name_input, resolved_patient_id)

    updates = ['patient_id = ?', 'patient_name = ?']
    params = [resolved_patient_id, resolved_patient_name]

    if step_index is not None:
        try:
            parsed_step = int(step_index)
        except (TypeError, ValueError):
            conn.close()
            return jsonify({'error': 'stepIndex must be an integer'}), 400

        stages = get_stages_from_db(conn)
        max_index = max(0, len(stages) - 1)
        if parsed_step < 0 or parsed_step > max_index:
            conn.close()
            return jsonify({'error': f'stepIndex must be between 0 and {max_index}'}), 400

        updates.append('step_index = ?')
        params.append(parsed_step)

    updates.append('last_updated = CURRENT_TIMESTAMP')
    params.append(serial)

    cursor.execute(f"UPDATE dentures SET {', '.join(updates)} WHERE serial_number = ?", tuple(params))
    conn.commit()

    cursor.execute('SELECT serial_number, patient_id, patient_name, step_index, last_updated FROM dentures WHERE serial_number = ?', (serial,))
    row = cursor.fetchone()
    stages = get_stages_from_db(conn)
    conn.close()

    step_name = stages[min(row[3], max(0, len(stages)-1))]['name'] if stages else None
    return jsonify({
        'status': 'success',
        'denture': {
            'serial': row[0],
            'patient_id': row[1],
            'patient': row[2],
            'step_index': row[3],
            'step_name': step_name,
            'updated': row[4]
        }
    })

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
