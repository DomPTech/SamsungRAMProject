const logContent = document.getElementById('log-content');
const statusText = document.getElementById('status-text');
const statusPanel = document.getElementById('support-status');
const btnRead = document.getElementById('btn-read');
const btnClearLog = document.getElementById('clear-log');
const toast = document.getElementById('toast');

const hostname = window.location.hostname || 'localhost';
const SERVER_URL = `http://${hostname}:5001`;

let activeAction = null; // 'read' or 'write'

// Initialize
window.addEventListener('load', () => {
    checkNFCSupport();

    // Register Service Worker
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js')
            .then(() => console.log('Service Worker Registered'))
            .catch(err => console.error('SW Registration Failed', err));
    }
});

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
                const response = await fetch(`${SERVER_URL}/api/scan`, {
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
                // ... rest of record handling if needed
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
