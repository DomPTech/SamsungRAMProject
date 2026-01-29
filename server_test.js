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
const rowNameInput = document.getElementById('row-name');
const rowValueInput = document.getElementById('row-value');
const btnCancel = document.getElementById('btn-cancel');
const btnSave = document.getElementById('btn-save');

let editingId = null;
let currentIp = localStorage.getItem('pi-server-ip') || "localhost";
let mockData = JSON.parse(localStorage.getItem('pi-server-data')) || [
    { id: 1, name: "Dominick", value: "Pelaia" },
    { id: 2, name: "Levi", value: "Dunn" }
];

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
    log(`Connecting to http://${currentIp}:5000...`, 'info');

    try {
        const res = await fetch(`http://${currentIp}:5000/api/rows`);
        if (!res.ok) throw new Error(`Server returned ${res.status}`);
        const data = await res.json();

        mockData = data; // Keep sync for local state if needed
        renderTable(data);
        setConnected(true);
        log("Data synchronized from Pi.", "success");
    } catch (e) {
        log(`Connection failed: ${e.message}. Ensure the server is running on the Pi.`, 'error');
        setConnected(false);
    }
}

function renderTable(data) {
    tableBody.innerHTML = '';
    data.forEach(row => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${row.id}</td>
            <td>${row.name}</td>
            <td>${row.value}</td>
            <td class="actions-cell">
                <button class="icon-btn edit-btn" data-id="${row.id}">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 113 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                </button>
                <button class="icon-btn delete-btn delete" data-id="${row.id}">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                </button>
            </td>
        `;
        tableBody.appendChild(tr);
    });

    // Attach listeners
    document.querySelectorAll('.edit-btn').forEach(btn => {
        btn.onclick = () => openModal(btn.dataset.id);
    });
    document.querySelectorAll('.delete-btn').forEach(btn => {
        btn.onclick = () => deleteRow(btn.dataset.id);
    });
}

function setConnected(status) {
    if (status) {
        statusText.textContent = `Connected to ${currentIp}`;
        statusPanel.classList.remove('error');
        statusPanel.classList.add('supported');
    } else {
        statusText.textContent = 'Disconnected';
        statusPanel.classList.remove('supported');
        statusPanel.classList.add('error');
    }
}

// CRUD Operations
async function saveRow(name, value) {
    log(`Transmitting row: ${name}...`, 'info');

    try {
        const method = editingId ? 'PUT' : 'POST';
        const url = editingId ? `http://${currentIp}:5000/api/rows/${editingId}` : `http://${currentIp}:5000/api/rows`;

        const res = await fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, value })
        });

        if (!res.ok) throw new Error("Server failed to save");

        log(`Server confirmed ${editingId ? 'update' : 'addition'}.`, 'success');
        await fetchData(); // Refresh table from server
        closeModal();
        showToast("Changes saved to Pi");
    } catch (e) {
        log(`Save failed: ${e.message}`, 'error');
        showToast("Error saving data");
    }
}

async function deleteRow(id) {
    if (!confirm(`Delete row #${id}?`)) return;

    log(`Requesting deletion of #${id}...`, 'info');

    try {
        const res = await fetch(`http://${currentIp}:5000/api/rows/${id}`, { method: 'DELETE' });
        if (!res.ok) throw new Error("Server deletion failed");

        log(`Deleted row #${id} from Pi`, 'success');
        await fetchData();
        showToast("Row deleted");
    } catch (e) {
        log(`Deletion error: ${e.message}`, 'error');
        showToast("Error deleting row");
    }
}

// Modal Logic
function openModal(id = null) {
    editingId = id;
    if (id) {
        modalTitle.textContent = "Edit Row";
        const row = mockData.find(r => r.id == id);
        rowNameInput.value = row.name;
        rowValueInput.value = row.value;
    } else {
        modalTitle.textContent = "Add New Row";
        rowNameInput.value = "";
        rowValueInput.value = "";
    }
    formOverlay.classList.add('active');
}

function closeModal() {
    formOverlay.classList.remove('active');
    editingId = null;
}

// Event Listeners
btnConnect.onclick = () => {
    currentIp = serverIpInput.value || "localhost";
    localStorage.setItem('pi-server-ip', currentIp);
    fetchData();
};

btnAdd.onclick = () => openModal();
btnCancel.onclick = closeModal;
btnSave.onclick = () => {
    if (rowNameInput.value && rowValueInput.value) {
        saveRow(rowNameInput.value, rowValueInput.value);
    } else {
        showToast("Please fill all fields");
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
