const logContent = document.getElementById('log-content');
const statusText = document.getElementById('status-text');
const statusPanel = document.getElementById('support-status');
const btnRead = document.getElementById('btn-read');
const btnClearLog = document.getElementById('clear-log');
const toast = document.getElementById('toast');

let activeAction = null; // 'read' or 'write'

window.addEventListener('load', () => {
    checkNFCSupport();

    // Register Service Worker
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js')
            .then(() => console.log('Service Worker Registered'))
            .catch(err => console.error('SW Registration Failed', err));
    }
    // Load stages from server for client-side UI
    fetchStages();
});

async function fetchStages() {
    try {
        const resp = await fetch('/api/stages');
        if (resp.ok) {
            const data = await resp.json();
            window.STAGES = data.stages || [];
            log(`Loaded ${window.STAGES.length} stage(s) from server`, 'info');
        } else {
            log('Failed to load stages from server', 'error');
        }
    } catch (err) {
        log(`Error fetching stages: ${err.message}`, 'error');
    }
}

function log(message, type = 'system') {
    const entry = document.createElement('div');
    entry.className = `log-entry ${type}`;
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    entry.textContent = `[${time}] ${message}`;
    logContent.prepend(entry);
}

function showToast(message, duration = 3000) {
    toast.textContent = message;
    toast.classList.remove('hidden');
    setTimeout(() => {
        toast.classList.add('hidden');
    }, duration);
}

// Using origin-relative endpoints for API calls (e.g. `/api/...`)

function openAdmin() {
    const modal = document.getElementById('adminModal');
    if (!modal) return;
    modal.classList.remove('hidden');
    const token = localStorage.getItem('admin_token');
    if (token) {
        document.getElementById('adminLoginForm').classList.add('hidden');
        document.getElementById('adminPanel').classList.remove('hidden');
        document.getElementById('adminLogoutBtn').classList.remove('hidden');
        fetchStagesAdmin();
    } else {
        document.getElementById('adminLoginForm').classList.remove('hidden');
        document.getElementById('adminPanel').classList.add('hidden');
    }
}

function closeAdmin() {
    const modal = document.getElementById('adminModal');
    if (!modal) return;
    modal.classList.add('hidden');
}

async function adminLogin() {
    const usernameEl = document.getElementById('adminUser');
    const passwordEl = document.getElementById('adminPass');
    if (!usernameEl || !passwordEl) return alert('Admin inputs not found');
    const username = usernameEl.value.trim();
    const password = passwordEl.value;
    if (!username || !password) return alert('Enter username and password');

    try {
        const resp = await fetch('/api/auth/login', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        const data = await resp.json();
        if (!resp.ok) return alert(data.error || 'Login failed');
        localStorage.setItem('admin_token', data.token);
        document.getElementById('adminLoginForm').classList.add('hidden');
        document.getElementById('adminPanel').classList.remove('hidden');
        document.getElementById('adminLogoutBtn').classList.remove('hidden');
        fetchStagesAdmin();
    } catch (err) {
        console.error('Login error', err);
        alert('Login failed');
    }
}

function adminLogout() {
    localStorage.removeItem('admin_token');
    document.getElementById('adminPanel').classList.add('hidden');
    document.getElementById('adminLoginForm').classList.remove('hidden');
    document.getElementById('adminLogoutBtn').classList.add('hidden');
}

async function fetchStagesAdmin() {
    try {
        const resp = await fetch('/api/stages');
        if (!resp.ok) throw new Error('Failed to fetch stages');
        const data = await resp.json();
        renderStagesAdmin(data.stages || []);
    } catch (err) {
        console.error('fetchStagesAdmin', err);
        alert('Unable to load stages from server');
    }
}

function renderStagesAdmin(stages) {
    const container = document.getElementById('adminStagesList');
    if (!container) return;
    container.innerHTML = '';
    if (!stages.length) {
        container.innerHTML = '<div style="color:#666;">No stages configured.</div>';
        return;
    }
    stages.forEach(s => {
        const el = document.createElement('div');
        el.style.display = 'flex';
        el.style.alignItems = 'center';
        el.style.gap = '8px';
        el.style.padding = '8px';
        el.style.borderBottom = '1px solid #eee';

        const nameInput = document.createElement('input');
        nameInput.value = s.name;
        nameInput.style.flex = '1';
        nameInput.style.padding = '8px';

        const saveBtn = document.createElement('button');
        saveBtn.className = 'btn';
        saveBtn.textContent = 'Save';
        saveBtn.onclick = () => updateStageAdmin(s.id, nameInput.value, s.ordering);

        const delBtn = document.createElement('button');
        delBtn.className = 'btn';
        delBtn.style.background = 'transparent';
        delBtn.style.border = '1px solid #ddd';
        delBtn.textContent = 'Delete';
        delBtn.onclick = () => { if (confirm('Delete this stage?')) deleteStageAdmin(s.id); };

        el.appendChild(nameInput);
        el.appendChild(saveBtn);
        el.appendChild(delBtn);
        container.appendChild(el);
    });
}

async function createStageAdmin() {
    const nameEl = document.getElementById('newStageName');
    if (!nameEl) return alert('New stage input not found');
    const name = nameEl.value.trim();
    if (!name) return alert('Enter a stage name');
    const token = localStorage.getItem('admin_token');
    try {
        const resp = await fetch('/api/stages', {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ name })
        });
        const data = await resp.json();
        if (!resp.ok) return alert(data.error || 'Failed to create');
        nameEl.value = '';
        renderStagesAdmin(data.stages || []);
    } catch (err) {
        console.error('createStageAdmin', err);
        alert('Failed to create stage');
    }
}

async function updateStageAdmin(id, name, ordering) {
    const token = localStorage.getItem('admin_token');
    try {
        const resp = await fetch(`/api/stages/${id}`, {
            method: 'PUT', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ name })
        });
        const data = await resp.json();
        if (!resp.ok) return alert(data.error || 'Failed to update');
        renderStagesAdmin(data.stages || []);
    } catch (err) {
        console.error('updateStageAdmin', err);
        alert('Failed to update stage');
    }
}

async function deleteStageAdmin(id) {
    const token = localStorage.getItem('admin_token');
    try {
        const resp = await fetch(`/api/stages/${id}`, {
            method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await resp.json();
        if (!resp.ok) return alert(data.error || 'Failed to delete');
        renderStagesAdmin(data.stages || []);
    } catch (err) {
        console.error('deleteStageAdmin', err);
        alert('Failed to delete stage');
    }
}

async function checkNFCSupport() {
    if ('NDEFReader' in window) {
        statusText.textContent = 'NFC is supported on this device';
        statusPanel.classList.add('supported');
        log('NFC Support detected.', 'success');
    } else {
        statusText.textContent = 'NFC is not supported on this browser/device';
        statusPanel.classList.add('error');
        log('NFC Support NOT detected. Ensure you are using Chrome on Android and HTTPS.', 'error');
        btnRead.style.opacity = '0.5';
        btnWrite.style.opacity = '0.5';
        btnRead.style.pointerEvents = 'none';
        btnWrite.style.pointerEvents = 'none';
    }
}

// Action Handlers
btnRead.onclick = async () => {
    setActiveAction('read');
    log('Scanning for tags... Place your phone near one.', 'info');

    try {
        const ndef = new NDEFReader();
        await ndef.scan();

        ndef.onreadingerror = () => {
            log('Error reading tag. Is it an NDEF tag?', 'error');
            showToast('Scan failed');
        };

        ndef.onreading = async ({ message, serialNumber }) => {
            log(`Tag detected! Serial: ${serialNumber}`, 'success');

            try {
                const response = await fetch('/api/scan', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ serialNumber })
                });

                const result = await response.json();
                if (response.ok) {
                    log(`Server Updated: ${result.step_name} (${result.status})`, 'success');
                    showToast(`Updated: ${result.step_name}`);
                } else {
                    log(`Server Error: ${result.error}`, 'error');
                }
            } catch (err) {
                log(`Failed to connect to scanner server: ${err.message}`, 'error');
            }

            for (const record of message.records) {
                // TODO: rest of record handling
            }
        };
    } catch (error) {
        log(`Scan failed: ${error}`, 'error');
    }
};

btnWrite.onclick = () => {
    setActiveAction('write');
    writePanel.classList.remove('hidden');
    nfcInput.focus();
    log('Enter content and scan a tag to write.', 'info');
};

nfcInput.oninput = async () => {
    const text = nfcInput.value;
    if (text.length > 0) {
        try {
            const ndef = new NDEFReader();
            // In Web NFC, write() starts the process and waits for a tag
            log(`Ready to write: "${text}"`, 'info');
            await ndef.write(text);
            log(`Successfully wrote to tag!`, 'success');
            showToast('Write Success!');
            nfcInput.value = '';
            writePanel.classList.add('hidden');
            setActiveAction(null);
        } catch (error) {
            // This might trigger immediately if permissions fail, 
            // or later if the tag is removed too early.
            if (error.name !== 'NotAllowedError' && error.name !== 'AbortError') {
                log(`Write failed: ${error}`, 'error');
            }
        }
    }
};

function setActiveAction(action) {
    activeAction = action;
    btnRead.classList.toggle('selected', action === 'read');
}

btnClearLog.onclick = () => {
    logContent.innerHTML = '<div class="log-entry system">Log cleared.</div>';
};
