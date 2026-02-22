window.onload = function() {
        renderPage('home');
        startTime();
};

async function renderPage(page, name = "Staff") {
    const content = document.getElementById("mainContent");

    if (page === 'home') {
        content.innerHTML = `
        <div class="dashboard-grid">
            <div>
                <h1 style="color: var(--primary); margin: 0;">Tray Tracking Dashboard</h1>
                <p style="color: #666; font-size: 1.1rem; margin-top: 5px;">Real-time progress of all denture trays.</p>
                <div id="denture-list" style="margin-top: 30px;">
                    <p>Loading trays...</p>
                </div>
            </div>
            <div class="card" style="height: fit-content;">
                <h3>Clinic Status</h3>
                <div style="background: #eee; height: 180px; border-radius: 8px; display: flex; align-items: center; justify-content: center; color: #999;">Active Station: Lab</div>
            </div>
        </div>`;

        await fetchDentures();
        // Auto-refresh every 5 seconds
        if (window.refreshInterval) clearInterval(window.refreshInterval);
        window.refreshInterval = setInterval(fetchDentures, 5000);

    } else if (page === 'about') {
    }
}

async function fetchDentures() {
    const SERVER_URL = getServerUrl();
    try {
        const response = await fetch(`${SERVER_URL}/api/dentures`);
        const data = await response.json();
        const dentures = data.dentures;
        const steps = data.steps;
        const totalSteps = steps.length;

        const list = document.getElementById('denture-list');
        if (!list) return;

        if (dentures.length === 0) {
            list.innerHTML = '<div class="card">No trays currently being tracked. Scan a tray to start.</div>';
            return;
        }

        list.innerHTML = dentures.map(d => {
            const progressPercent = Math.min(((d.step_index + 1) / totalSteps) * 100, 100);
            return `
            <div class="card" style="margin-bottom: 15px; border-left: 8px solid ${d.step_index >= totalSteps - 1 ? 'var(--accent)' : 'var(--secondary)'}">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <h3 style="margin: 0;">${d.patient} (ID: ${d.serial.slice(-4)})</h3>
                        <p style="margin: 5px 0; color: var(--primary); font-weight: 600;">Status: ${d.step_name}</p>
                    </div>
                    <div style="text-align: right;">
                        <span style="font-size: 0.8rem; color: #888;">Step ${d.step_index + 1} of ${totalSteps}</span><br>
                        <span style="font-size: 0.7rem; color: #aaa;">Updated: ${new Date(d.updated).toLocaleTimeString()}</span>
                    </div>
                </div>
                <div style="background: #eee; height: 8px; border-radius: 4px; margin-top: 15px; overflow: hidden;">
                    <div style="background: var(--accent); width: ${progressPercent}%; height: 100%; transition: width 0.5s;"></div>
                </div>
            </div>
        `}).join('');
    } catch (err) {
        console.error("Failed to fetch dentures:", err);
    }
}

function startTime() {
    setInterval(() => {
        const now = new Date();
        document.getElementById('liveTime').innerText = now.toLocaleString();
    }, 1000);
}

function getServerUrl() {
    return window.location.origin;
}

function openAdmin() {
    document.getElementById('adminModal').classList.remove('hidden');
    const token = localStorage.getItem('adminToken');
    if (token) {
        document.getElementById('adminLoginForm').classList.add('hidden');
        document.getElementById('adminPanel').classList.remove('hidden');
        document.getElementById('adminLogoutBtn').classList.remove('hidden');
        loadAdminStages();
    } else {
        document.getElementById('adminLoginForm').classList.remove('hidden');
        document.getElementById('adminPanel').classList.add('hidden');
        document.getElementById('adminLogoutBtn').classList.add('hidden');
    }
}

function closeAdmin() {
    document.getElementById('adminModal').classList.add('hidden');
}

async function adminLogin() {
    const user = document.getElementById('adminUser').value.trim();
    const pass = document.getElementById('adminPass').value;
    if (!user || !pass) { alert('Enter username and password'); return; }
    const SERVER_URL = getServerUrl();
    try {
        const res = await fetch(`${SERVER_URL}/api/auth/login`, {
            method: 'POST', headers: {'Content-Type':'application/json'},
            body: JSON.stringify({username: user, password: pass})
        });
        const data = await res.json();
        if (res.ok && data.token) {
            localStorage.setItem('adminToken', data.token);
            document.getElementById('adminLoginForm').classList.add('hidden');
            document.getElementById('adminPanel').classList.remove('hidden');
            document.getElementById('adminLogoutBtn').classList.remove('hidden');
            loadAdminStages();
        } else {
            alert(data.error || 'Login failed');
        }
    } catch (err) {
        console.error('Admin login failed', err);
        alert('Unable to contact server');
    }
}

function adminLogout() {
    localStorage.removeItem('adminToken');
    document.getElementById('adminPanel').classList.add('hidden');
    document.getElementById('adminLoginForm').classList.remove('hidden');
    document.getElementById('adminLogoutBtn').classList.add('hidden');
}

async function loadAdminStages() {
    const SERVER_URL = getServerUrl();
    try {
        const res = await fetch(`${SERVER_URL}/api/stages`);
        const data = await res.json();
        const list = document.getElementById('adminStagesList');
        list.innerHTML = '';
        data.stages.forEach(s => {
            const el = document.createElement('div');
            el.style.display = 'flex';
            el.style.justifyContent = 'space-between';
            el.style.alignItems = 'center';
            el.style.padding = '8px 6px';
            el.style.borderBottom = '1px solid #f0f0f0';
            el.innerHTML = `<div style="flex:1">${s.ordering+1}. ${s.name}</div>`;
            const actions = document.createElement('div');
            actions.style.display = 'flex';
            actions.style.gap = '6px';
            const editBtn = document.createElement('button');
            editBtn.className = 'btn'; editBtn.style.background = '#e0e0e0'; editBtn.innerText = 'Edit';
            editBtn.onclick = () => editStageAdmin(s.id, s.name);
            const delBtn = document.createElement('button');
            delBtn.className = 'btn'; delBtn.style.background = '#f44336'; delBtn.style.color = 'white'; delBtn.innerText = 'Delete';
            delBtn.onclick = () => deleteStageAdmin(s.id);
            actions.appendChild(editBtn); actions.appendChild(delBtn);
            el.appendChild(actions);
            list.appendChild(el);
        });
    } catch (err) {
        console.error('Failed to load stages', err);
    }
}

async function createStageAdmin() {
    const name = document.getElementById('newStageName').value.trim();
    if (!name) { alert('Enter a stage name'); return; }
    const SERVER_URL = getServerUrl();
    const token = localStorage.getItem('adminToken');
    try {
        const res = await fetch(`${SERVER_URL}/api/stages`, {
            method: 'POST', headers: {'Content-Type':'application/json', 'Authorization': `Bearer ${token}`},
            body: JSON.stringify({name})
        });
        const data = await res.json();
        if (res.ok) {
            document.getElementById('newStageName').value = '';
            loadAdminStages();
        } else {
            alert(data.error || 'Failed to create stage');
        }
    } catch (err) {
        console.error('Create stage failed', err);
        alert('Unable to contact server');
    }
}

async function deleteStageAdmin(id) {
    if (!confirm('Delete this stage?')) return;
    const SERVER_URL = getServerUrl();
    const token = localStorage.getItem('adminToken');
    try {
        const res = await fetch(`${SERVER_URL}/api/stages/${id}`, {
            method: 'DELETE', headers: {'Authorization': `Bearer ${token}`}
        });
        if (res.ok) loadAdminStages();
        else {
            const data = await res.json(); alert(data.error || 'Failed to delete');
        }
    } catch (err) { console.error(err); alert('Unable to contact server'); }
}

async function editStageAdmin(id, currentName) {
    const name = prompt('New stage name', currentName);
    if (name === null) return;
    const ordering = parseInt(prompt('New ordering (0-based index)', '0')); // optional
    const payload = {};
    if (name) payload.name = name;
    if (!isNaN(ordering)) payload.ordering = ordering;
    const SERVER_URL = getServerUrl();
    const token = localStorage.getItem('adminToken');
    try {
        const res = await fetch(`${SERVER_URL}/api/stages/${id}`, {
            method: 'PUT', headers: {'Content-Type':'application/json', 'Authorization': `Bearer ${token}`},
            body: JSON.stringify(payload)
        });
        if (res.ok) loadAdminStages();
        else { const data = await res.json(); alert(data.error || 'Update failed'); }
    } catch (err) { console.error(err); alert('Unable to contact server'); }
}
