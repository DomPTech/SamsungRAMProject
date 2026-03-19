const logContent = document.getElementById('log-content');
const statusText = document.getElementById('status-text');
const statusPanel = document.getElementById('support-status');
const btnRead = document.getElementById('btn-read');
const btnWrite = document.getElementById('btn-write');
const btnClearLog = document.getElementById('clear-log');
const toast = document.getElementById('toast');
const writePanel = document.getElementById('write-panel');
const patientNameInput = document.getElementById('patient-name');
const patientIdInput = document.getElementById('patient-id');
const btnWriteStart = document.getElementById('btn-write-start');
const adminLoginForm = document.getElementById('admin-login-form');
const adminUserInput = document.getElementById('admin-user');
const adminPassInput = document.getElementById('admin-pass');
const adminLoginBtn = document.getElementById('admin-login-btn');
const adminLogoutBtn = document.getElementById('admin-logout-btn');
const authStatus = document.getElementById('auth-status');

let activeAction = null; // 'read' or 'write'
let nfcSupported = false;
let scannerLocked = false;

window.addEventListener('load', () => {
    setupAuthUI();
    checkNFCSupport();

    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js')
            .catch(err => console.error('SW Registration Failed', err));
    }

    fetchStages();
});

function getAuthToken() {
    const token = localStorage.getItem('admin_token') || localStorage.getItem('adminToken');
    if (token && !localStorage.getItem('adminToken')) {
        localStorage.setItem('adminToken', token);
    }
    return token;
}

function setAuthToken(token) {
    localStorage.setItem('adminToken', token);
    localStorage.setItem('admin_token', token);
}

function clearAuthToken() {
    localStorage.removeItem('adminToken');
    localStorage.removeItem('admin_token');
}

function setupAuthUI() {
    if (adminLoginBtn) {
        adminLoginBtn.addEventListener('click', adminLogin);
    }
    if (adminLogoutBtn) {
        adminLogoutBtn.addEventListener('click', adminLogout);
    }

    const authenticated = Boolean(getAuthToken());
    updateAuthState(authenticated);

    btnRead.addEventListener('click', startReadMode);
    btnWrite.addEventListener('click', showWritePanel);
    btnWriteStart.addEventListener('click', startWriteMode);

    btnClearLog.addEventListener('click', () => {
        logContent.innerHTML = '<div class="log-entry system">Log cleared.</div>';
    });
}

function updateAuthState(authenticated) {
    if (authenticated) {
        authStatus.textContent = 'Admin authenticated. Scanner actions are enabled.';
        authStatus.className = 'log-entry success';
        adminLoginForm.classList.add('hidden');
        adminLogoutBtn.classList.remove('hidden');
        setScannerEnabled(true);
    } else {
        authStatus.textContent = 'Admin login required for scanning and writing.';
        authStatus.className = 'log-entry error';
        adminLoginForm.classList.remove('hidden');
        adminLogoutBtn.classList.add('hidden');
        writePanel.classList.add('hidden');
        setScannerEnabled(false);
    }
}

function setScannerEnabled(enabled) {
    const opacity = enabled ? '1' : '0.55';
    btnRead.style.opacity = opacity;
    btnWrite.style.opacity = opacity;
    btnRead.style.pointerEvents = enabled ? 'auto' : 'none';
    btnWrite.style.pointerEvents = enabled ? 'auto' : 'none';
}

async function adminLogin() {
    const username = adminUserInput.value.trim();
    const password = adminPassInput.value;

    if (!username || !password) {
        showToast('Enter admin credentials');
        return;
    }

    try {
        const resp = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        const data = await resp.json();
        if (!resp.ok || !data.token) {
            showToast(data.error || 'Login failed');
            return;
        }

        setAuthToken(data.token);
        adminPassInput.value = '';
        updateAuthState(true);
        log('Admin authenticated for scanner actions.', 'success');
    } catch (err) {
        log(`Admin login failed: ${err.message}`, 'error');
        showToast('Login failed');
    }
}

function adminLogout() {
    clearAuthToken();
    updateAuthState(false);
    log('Admin logged out.', 'system');
}

async function fetchStages() {
    try {
        const resp = await fetch('/api/stages');
        if (!resp.ok) {
            log('Failed to load stages from server', 'error');
            return;
        }

        const data = await resp.json();
        window.STAGES = data.stages || [];
        log(`Loaded ${window.STAGES.length} stage(s) from server`, 'info');
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

async function checkNFCSupport() {
    if ('NDEFReader' in window) {
        nfcSupported = true;
        statusText.textContent = 'NFC supported. Admin login required.';
        statusPanel.classList.add('supported');
        log('NFC support detected.', 'success');
    } else {
        nfcSupported = false;
        statusText.textContent = 'NFC is not supported on this browser/device';
        statusPanel.classList.add('error');
        log('NFC support not detected. Use Chrome on Android over HTTPS.', 'error');
        setScannerEnabled(false);
    }
}

function ensureReadyForAction(action) {
    if (!nfcSupported) {
        showToast('NFC not supported');
        return false;
    }

    if (!getAuthToken()) {
        showToast('Admin login required');
        log(`${action} blocked: admin authentication required.`, 'error');
        updateAuthState(false);
        return false;
    }

    if (scannerLocked) {
        showToast('Scanner busy. Finish current action first.');
        return false;
    }

    return true;
}

function setActiveAction(action) {
    activeAction = action;
    btnRead.classList.toggle('selected', action === 'read');
    btnWrite.classList.toggle('selected', action === 'write');
}

function showWritePanel() {
    if (!ensureReadyForAction('Write')) {
        return;
    }

    setActiveAction('write');
    writePanel.classList.remove('hidden');
    patientNameInput.focus();
    log('Enter patient name/ID, then tap "Write to Tag".', 'info');
}

async function startReadMode() {
    if (!ensureReadyForAction('Scan')) {
        return;
    }

    setActiveAction('read');
    writePanel.classList.add('hidden');
    scannerLocked = true;
    log('Scanning for tray tags. Tap a tray now.', 'info');

    try {
        const ndef = new NDEFReader();
        await ndef.scan();

        ndef.onreadingerror = () => {
            log('Error reading tag. Is it an NDEF tag?', 'error');
            showToast('Scan failed');
            scannerLocked = false;
        };

        ndef.onreading = async ({ serialNumber }) => {
            const token = getAuthToken();
            if (!token) {
                scannerLocked = false;
                updateAuthState(false);
                return;
            }

            log(`Tag detected: ${serialNumber}`, 'success');

            try {
                const response = await fetch('/api/scan', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({ serialNumber })
                });

                const result = await response.json();
                if (response.ok) {
                    if (result.status === 'reset') {
                        log('Tray reached final stage previously. It was removed and reset.', 'success');
                        showToast('Tray reset and removed from dashboard');
                    } else {
                        log(`Progress updated: ${result.step_name} (${result.status})`, 'success');
                        showToast(`Updated: ${result.step_name}`);
                    }
                } else if (response.status === 401) {
                    clearAuthToken();
                    updateAuthState(false);
                    log('Unauthorized scanner request. Please login again.', 'error');
                    showToast('Session expired');
                } else {
                    log(`Server error: ${result.error || 'Unknown error'}`, 'error');
                }
            } catch (err) {
                log(`Failed to connect to scanner server: ${err.message}`, 'error');
            }

            scannerLocked = false;
            setActiveAction(null);
        };
    } catch (error) {
        scannerLocked = false;
        setActiveAction(null);
        log(`Scan failed: ${error.message || error}`, 'error');
    }
}

async function startWriteMode() {
    if (!ensureReadyForAction('Write')) {
        return;
    }

    const patientName = patientNameInput.value.trim();
    const patientId = patientIdInput.value.trim();

    if (!patientName && !patientId) {
        showToast('Enter patient name or ID');
        return;
    }

    const displayName = patientName || `ID-${patientId}`;
    const payload = JSON.stringify({
        patientName: patientName || null,
        patientId: patientId || null,
        writtenAt: new Date().toISOString()
    });

    scannerLocked = true;
    log('Ready to write. Tap the target NFC tag now.', 'info');

    try {
        const ndef = new NDEFReader();
        await ndef.scan();

        ndef.onreadingerror = () => {
            log('Unable to read tag details before writing.', 'error');
            showToast('Write failed');
            scannerLocked = false;
        };

        ndef.onreading = async ({ serialNumber }) => {
            const token = getAuthToken();
            if (!token) {
                scannerLocked = false;
                updateAuthState(false);
                return;
            }

            try {
                await ndef.write(payload);

                const registerResp = await fetch('/api/dentures/register', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({
                        serialNumber,
                        patientName: displayName
                    })
                });

                const registerData = await registerResp.json();
                if (!registerResp.ok) {
                    throw new Error(registerData.error || 'Server registration failed');
                }

                log(`Wrote and registered tag ${serialNumber} for ${displayName}.`, 'success');
                showToast('Tag write complete');
                patientNameInput.value = '';
                patientIdInput.value = '';
                writePanel.classList.add('hidden');
                setActiveAction(null);
            } catch (err) {
                log(`Write/registration failed: ${err.message}`, 'error');
                showToast('Write failed');
            }

            scannerLocked = false;
        };
    } catch (error) {
        scannerLocked = false;
        log(`Write setup failed: ${error.message || error}`, 'error');
    }
}
