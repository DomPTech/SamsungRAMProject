const logContent = document.getElementById('log-content');
const statusText = document.getElementById('status-text');
const statusPanel = document.getElementById('support-status');
const serverIpInput = document.getElementById('server-ip');
const btnConnect = document.getElementById('btn-connect');
const btnAdd = document.getElementById('btn-add');
const btnClearLog = document.getElementById('clear-log');
const tableBody = document.getElementById('table-body');
const toast = document.getElementById('toast');

// Modal Elements
const formOverlay = document.getElementById('form-overlay');
const modalTitle = document.getElementById('modal-title');
const rowNameInput = document.getElementById('row-name'); // Acts as Serial Number
const rowValueInput = document.getElementById('row-value'); // Acts as Patient Name (unused for now)
const btnCancel = document.getElementById('btn-cancel');
const btnSave = document.getElementById('btn-save');

let editingId = null;
let currentIp = localStorage.getItem('pi-server-ip') || "raspberrypi.local";

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

// Data Fetching Logic
async function fetchData() {
    // Port 5001 is the correct port for server.py
    const url = `https://${currentIp}:5001/api/dentures`;
    log(`Connecting to ${url}...`, 'info');

    try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Server returned ${res.status}`);
        const data = await res.json();

        // Expecting data.dentures array based on server.py
        renderTable(data.dentures || []);
        setConnected(true);
        log("Data synchronized from Pi.", "success");
    } catch (e) {
        log(`Connection failed: ${e.message}. Ensure the server is running on ${currentIp}:5001`, 'error');
        setConnected(false);
    }
}

function renderTable(data) {
    tableBody.innerHTML = '';
    if (data.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px;">No dentures found. Add one to test.</td></tr>';
        return;
    }

    data.forEach(row => {
        const tr = document.createElement('tr');
        // server.py keys: serial, patient, step_name, updated
        tr.innerHTML = `
            <td>${row.serial}</td>
            <td>${row.patient}</td>
            <td>${row.step_name} (${row.step_index})</td>
            <td>${new Date(row.updated).toLocaleString()}</td>
            <td class="actions-cell">
                <button class="icon-btn delete-btn delete" data-id="${row.serial}">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                </button>
            </td>
        `;
        tableBody.appendChild(tr);
    });

    document.querySelectorAll('.delete-btn').forEach(btn => {
        btn.onclick = () => deleteRow(btn.dataset.id);
    });
}

function setConnected(status) {
    if (status) {
        statusText.textContent = `Connected to ${currentIp}:5001`;
        statusPanel.classList.remove('error');
        statusPanel.classList.add('supported');
    } else {
        statusText.textContent = 'Disconnected';
        statusPanel.classList.remove('supported');
        statusPanel.classList.add('error');
    }
}

// CRUD Operations
async function saveRow(serial) {
    // We treat "Add Row" as "Simulate Scan" because server.py only has /api/scan to create/update
    log(`Simulating scan for serial: ${serial}...`, 'info');

    try {
        const url = `https://${currentIp}:5001/api/scan`;

        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ serialNumber: serial })
        });

        if (!res.ok) throw new Error("Server failed to save/scan");
        const result = await res.json();

        log(`Server responded: ${result.status}. New Step: ${result.step_name}`, 'success');
        await fetchData(); // Refresh table from server
        closeModal();
        showToast("Denture updated via simulated scan");
    } catch (e) {
        log(`Save failed: ${e.message}`, 'error');
        showToast("Error saving data");
    }
}

async function deleteRow(serial) {
    if (!confirm(`Delete denture #${serial}?`)) return;

    log(`Requesting deletion of #${serial}...`, 'info');

    try {
        const res = await fetch(`https://${currentIp}:5001/api/dentures/${serial}`, { method: 'DELETE' });
        if (!res.ok) throw new Error("Server deletion failed");

        log(`Deleted #${serial} from Pi`, 'success');
        await fetchData();
        showToast("Denture deleted");
    } catch (e) {
        log(`Deletion error: ${e.message}`, 'error');
        showToast("Error deleting row");
    }
}

// Modal Logic
function openModal() {
    modalTitle.textContent = "Simulate Scan (Add/Update)";
    rowNameInput.value = "";
    formOverlay.classList.add('active');
}

function closeModal() {
    formOverlay.classList.remove('active');
}

// Event Listeners
btnConnect.onclick = () => {
    // Allow user to enter standard IP or IP:PORT
    let inputVal = serverIpInput.value || "raspberrypi.local";
    // Strip https:// if present
    inputVal = inputVal.replace('https://', '').replace('https://', '');

    // If user didn't specify port, we assume they mean the host IP, so we keep it as is.
    // The fetchData function adds :5001. 
    // However, if the user explicitly typed 192.168.1.50:5001, we should handle that.
    // For simplicity, let's assume the input is just the IP address as the placeholder suggests "Pi IP Address"

    // Check if port is already in input
    if (inputVal.includes(':')) {
        // If they added a port, let's just use the hostname part for currentIp variable consistency 
        // OR we just assume they know what they are doing. 
        // Current logic assumes `currentIp` is just the host.
        currentIp = inputVal.split(':')[0];
    } else {
        currentIp = inputVal;
    }

    localStorage.setItem('pi-server-ip', currentIp);
    fetchData();
};

btnAdd.onclick = () => openModal();
btnCancel.onclick = closeModal;
btnSave.onclick = () => {
    if (rowNameInput.value) {
        saveRow(rowNameInput.value);
    } else {
        showToast("Please enter a serial number");
    }
};

btnClearLog.onclick = () => {
    logContent.innerHTML = '<div class="log-entry system">Log cleared.</div>';
};

// Initial Fetch
window.onload = () => {
    serverIpInput.value = currentIp;
    fetchData();
};
