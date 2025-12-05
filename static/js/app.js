// API Base URL
const API_BASE = window.location.origin;

// WebSocket connection
let ws = null;

// ============================================
// Initialization
// ============================================

document.addEventListener('DOMContentLoaded', () => {
    checkAPIHealth();
    setupTabs();
    loadCameras();
    loadPersons();

    // Refresh data every 30 seconds
    setInterval(() => {
        checkAPIHealth();
        loadCameras();
    }, 30000);
});

// ============================================
// API Health Check
// ============================================

async function checkAPIHealth() {
    try {
        const response = await fetch(`${API_BASE}/api/health`);
        const data = await response.json();

        const statusEl = document.getElementById('apiStatus');
        const indicator = statusEl.querySelector('.status-indicator');
        const text = statusEl.querySelector('.status-text');

        if (data.status === 'healthy') {
            indicator.className = 'status-indicator connected';
            text.textContent = 'Connected to airaFace API';
        } else {
            indicator.className = 'status-indicator disconnected';
            text.textContent = 'API Disconnected';
        }
    } catch (error) {
        const statusEl = document.getElementById('apiStatus');
        const indicator = statusEl.querySelector('.status-indicator');
        const text = statusEl.querySelector('.status-text');
        indicator.className = 'status-indicator disconnected';
        text.textContent = 'Connection Failed';
    }
}

// ============================================
// Tab Navigation
// ============================================

function setupTabs() {
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const tabName = btn.dataset.tab;

            // Remove active class from all
            tabBtns.forEach(b => b.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));

            // Add active class to current
            btn.classList.add('active');
            document.getElementById(`${tabName}-tab`).classList.add('active');

            // Load data based on tab
            if (tabName === 'persons') loadPersons();
            if (tabName === 'events') loadEvents();
            if (tabName === 'recognitions') loadRecognitions();
        });
    });
}

// ============================================
// Camera Management
// ============================================

async function loadCameras() {
    try {
        const response = await fetch(`${API_BASE}/api/cameras`);
        const data = await response.json();

        const cameraGrid = document.getElementById('cameraGrid');
        const cameraSelect = document.getElementById('cameraSelect');

        if (data.cameras && data.cameras.length > 0) {
            // Update grid
            cameraGrid.innerHTML = data.cameras.map(camera => `
                <div class="camera-card">
                    <h3>${camera.name || 'Unnamed Camera'}</h3>
                    <p><strong>ID:</strong> ${camera.id}</p>
                    <p><strong>IP:</strong> ${camera.ip || 'N/A'}</p>
                    <p><strong>Port:</strong> ${camera.port || 'N/A'}</p>
                    <span class="camera-status ${camera.online ? 'online' : 'offline'}">
                        ${camera.online ? 'Online' : 'Offline'}
                    </span>
                </div>
            `).join('');

            // Update select dropdown
            cameraSelect.innerHTML = '<option value="">Select a camera</option>' +
                data.cameras.map(camera =>
                    `<option value="${camera.id}">${camera.name || camera.id}</option>`
                ).join('');
        } else {
            cameraGrid.innerHTML = '<div class="loading">No cameras registered yet</div>';
        }
    } catch (error) {
        console.error('Error loading cameras:', error);
        document.getElementById('cameraGrid').innerHTML =
            '<div class="loading">Error loading cameras</div>';
    }
}

function selectCamera() {
    const cameraId = document.getElementById('cameraSelect').value;
    const cameraFeed = document.getElementById('cameraFeed');
    const videoOverlay = document.getElementById('videoOverlay');

    if (cameraId) {
        cameraFeed.src = `${API_BASE}/api/camera/${cameraId}/stream`;
        videoOverlay.classList.add('hidden');
    } else {
        cameraFeed.src = '';
        videoOverlay.classList.remove('hidden');
    }
}

function showAddCameraModal() {
    document.getElementById('addCameraModal').classList.add('active');
}

async function addCamera(event) {
    event.preventDefault();

    const form = event.target;
    const formData = new FormData(form);

    const cameraData = {
        name: formData.get('name'),
        ip: formData.get('ip'),
        port: parseInt(formData.get('port')),
        username: formData.get('username'),
        password: formData.get('password'),
        url: `rtsp://${formData.get('ip')}:${formData.get('port')}/stream`
    };

    try {
        const response = await fetch(`${API_BASE}/api/cameras`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(cameraData)
        });

        const result = await response.json();

        if (response.ok) {
            alert('Camera added successfully!');
            closeModal('addCameraModal');
            form.reset();
            loadCameras();
        } else {
            alert(`Error: ${result.error || 'Failed to add camera'}`);
        }
    } catch (error) {
        console.error('Error adding camera:', error);
        alert('Failed to add camera');
    }
}

// ============================================
// Person Management
// ============================================

async function loadPersons() {
    try {
        const response = await fetch(`${API_BASE}/api/persons`);
        const data = await response.json();

        const tbody = document.querySelector('#personsTable tbody');

        if (data.persons && data.persons.length > 0) {
            tbody.innerHTML = data.persons.map(person => `
                <tr>
                    <td>${person.id}</td>
                    <td>${person.fullname}</td>
                    <td>${person.employeeno || 'N/A'}</td>
                    <td>
                        <button class="btn btn-danger" onclick="deletePerson('${person.id}')">Delete</button>
                    </td>
                </tr>
            `).join('');
        } else {
            tbody.innerHTML = '<tr><td colspan="4" class="loading">No persons registered yet</td></tr>';
        }
    } catch (error) {
        console.error('Error loading persons:', error);
        document.querySelector('#personsTable tbody').innerHTML =
            '<tr><td colspan="4" class="loading">Error loading persons</td></tr>';
    }
}

function showAddPersonModal() {
    document.getElementById('addPersonModal').classList.add('active');
}

async function addPerson(event) {
    event.preventDefault();

    const form = event.target;
    const formData = new FormData(form);

    const personData = {
        fullname: formData.get('fullname'),
        employeeno: formData.get('employeeno')
    };

    // Handle photo upload if provided
    const photoFile = formData.get('photo');
    if (photoFile && photoFile.size > 0) {
        // Convert to base64
        const base64 = await fileToBase64(photoFile);
        personData.photo = base64;
    }

    try {
        const response = await fetch(`${API_BASE}/api/persons`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(personData)
        });

        const result = await response.json();

        if (response.ok) {
            alert('Person added successfully!');
            closeModal('addPersonModal');
            form.reset();
            loadPersons();
        } else {
            alert(`Error: ${result.error || 'Failed to add person'}`);
        }
    } catch (error) {
        console.error('Error adding person:', error);
        alert('Failed to add person');
    }
}

async function deletePerson(personId) {
    if (!confirm('Are you sure you want to delete this person?')) {
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/api/persons/${personId}`, {
            method: 'DELETE'
        });

        if (response.ok) {
            alert('Person deleted successfully!');
            loadPersons();
        } else {
            alert('Failed to delete person');
        }
    } catch (error) {
        console.error('Error deleting person:', error);
        alert('Failed to delete person');
    }
}

// ============================================
// Event Handler Management
// ============================================

async function loadEvents() {
    try {
        const response = await fetch(`${API_BASE}/api/events`);
        const data = await response.json();

        const tbody = document.querySelector('#eventsTable tbody');

        if (data.events && data.events.length > 0) {
            tbody.innerHTML = data.events.map(event => `
                <tr>
                    <td>${event.name}</td>
                    <td>${event.action_type || 'http'}</td>
                    <td>${event.enable ? 'Enabled' : 'Disabled'}</td>
                    <td>${event.url || 'N/A'}</td>
                    <td>
                        <button class="btn btn-danger" onclick="deleteEvent('${event.id}')">Delete</button>
                    </td>
                </tr>
            `).join('');
        } else {
            tbody.innerHTML = '<tr><td colspan="5" class="loading">No events configured yet</td></tr>';
        }
    } catch (error) {
        console.error('Error loading events:', error);
        document.querySelector('#eventsTable tbody').innerHTML =
            '<tr><td colspan="5" class="loading">Error loading events</td></tr>';
    }
}

function showAddEventModal() {
    document.getElementById('addEventModal').classList.add('active');
}

async function addEvent(event) {
    event.preventDefault();

    const form = event.target;
    const formData = new FormData(form);

    const eventData = {
        name: formData.get('name'),
        url: formData.get('url'),
        method: formData.get('method'),
        enable: formData.get('enable') === 'on'
    };

    try {
        const response = await fetch(`${API_BASE}/api/events`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(eventData)
        });

        const result = await response.json();

        if (response.ok) {
            alert('Event handler created successfully!');
            closeModal('addEventModal');
            form.reset();
            loadEvents();
        } else {
            alert(`Error: ${result.error || 'Failed to create event'}`);
        }
    } catch (error) {
        console.error('Error creating event:', error);
        alert('Failed to create event');
    }
}

async function deleteEvent(eventId) {
    if (!confirm('Are you sure you want to delete this event handler?')) {
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/api/events/${eventId}`, {
            method: 'DELETE'
        });

        if (response.ok) {
            alert('Event deleted successfully!');
            loadEvents();
        } else {
            alert('Failed to delete event');
        }
    } catch (error) {
        console.error('Error deleting event:', error);
        alert('Failed to delete event');
    }
}

// ============================================
// Recognition Results
// ============================================

async function queryRecognitions() {
    const startTime = document.getElementById('startTime').value;
    const endTime = document.getElementById('endTime').value;

    let url = `${API_BASE}/api/recognitions`;
    const params = new URLSearchParams();

    if (startTime) params.append('start_time', startTime);
    if (endTime) params.append('end_time', endTime);

    if (params.toString()) {
        url += '?' + params.toString();
    }

    try {
        const response = await fetch(url);
        const data = await response.json();

        const grid = document.getElementById('recognitionGrid');

        if (data.results && data.results.length > 0) {
            grid.innerHTML = data.results.map(result => `
                <div class="recognition-card">
                    <img src="data:image/jpeg;base64,${result.snapshot}" alt="Snapshot">
                    <h4>${result.person_info?.fullname || 'Unknown'}</h4>
                    <p><strong>Employee:</strong> ${result.person_info?.employeeno || 'N/A'}</p>
                    <p><strong>Camera:</strong> ${result.channel}</p>
                    <p><strong>Time:</strong> ${new Date(result.timestamp).toLocaleString()}</p>
                    <span class="score">Score: ${(result.score * 100).toFixed(1)}%</span>
                </div>
            `).join('');
        } else {
            grid.innerHTML = '<div class="loading">No recognition results found</div>';
        }
    } catch (error) {
        console.error('Error loading recognitions:', error);
        document.getElementById('recognitionGrid').innerHTML =
            '<div class="loading">Error loading recognitions</div>';
    }
}

async function loadRecognitions() {
    // Set default time range (last 24 hours)
    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - 24 * 60 * 60 * 1000);

    document.getElementById('endTime').value = endTime.toISOString().slice(0, 16);
    document.getElementById('startTime').value = startTime.toISOString().slice(0, 16);

    queryRecognitions();
}

// ============================================
// WebSocket Real-time Recognition
// ============================================

async function toggleWebSocket() {
    const button = document.getElementById('wsToggle');
    const status = document.getElementById('wsStatus');

    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.close();
        button.textContent = 'Connect WebSocket';
        status.textContent = 'Disconnected';
        status.classList.remove('connected');
    } else {
        try {
            // Get WebSocket URL from API
            const response = await fetch(`${API_BASE}/api/websocket/info`);
            const data = await response.json();

            ws = new WebSocket(data.websocket_url);

            ws.onopen = () => {
                button.textContent = 'Disconnect WebSocket';
                status.textContent = 'Connected';
                status.classList.add('connected');
            };

            ws.onmessage = (event) => {
                const recognition = JSON.parse(event.data);
                addLiveRecognition(recognition);
            };

            ws.onerror = (error) => {
                console.error('WebSocket error:', error);
                status.textContent = 'Connection Error';
                status.classList.remove('connected');
            };

            ws.onclose = () => {
                button.textContent = 'Connect WebSocket';
                status.textContent = 'Disconnected';
                status.classList.remove('connected');
            };
        } catch (error) {
            console.error('Error connecting WebSocket:', error);
            alert('Failed to connect WebSocket');
        }
    }
}

function addLiveRecognition(recognition) {
    const container = document.getElementById('liveRecognitions');

    // Remove placeholder text if exists
    const placeholder = container.querySelector('.info-text');
    if (placeholder) {
        placeholder.remove();
    }

    // Create recognition card
    const card = document.createElement('div');
    card.className = 'recognition-card';
    card.innerHTML = `
        <img src="data:image/jpeg;base64,${recognition.snapshot}" alt="Snapshot">
        <h4>${recognition.person_info?.fullname || 'Unknown'}</h4>
        <p><strong>Employee:</strong> ${recognition.person_info?.employeeno || 'N/A'}</p>
        <p><strong>Camera:</strong> ${recognition.channel}</p>
        <p><strong>Time:</strong> ${new Date(recognition.timestamp).toLocaleString()}</p>
        <span class="score">Score: ${(recognition.score * 100).toFixed(1)}%</span>
    `;

    // Add to beginning of container
    container.insertBefore(card, container.firstChild);

    // Keep only last 20 recognitions
    while (container.children.length > 20) {
        container.removeChild(container.lastChild);
    }
}

// ============================================
// Modal Functions
// ============================================

function closeModal(modalId) {
    document.getElementById(modalId).classList.remove('active');
}

// Close modal when clicking outside
window.onclick = function(event) {
    if (event.target.classList.contains('modal')) {
        event.target.classList.remove('active');
    }
};

// ============================================
// Utility Functions
// ============================================

function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.onerror = error => reject(error);
    });
}