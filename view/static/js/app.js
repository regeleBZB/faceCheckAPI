// Global variables
let currentCamera = null;
let ws = null;
let cameraRefreshInterval = null;

// Initialize app
document.addEventListener('DOMContentLoaded', function() {
    checkAPIHealth();
    loadCameras();
    setupTabs();

    // Set default date range for recognitions
    const now = new Date();
    const startTime = new Date(now - 24 * 60 * 60 * 1000); // 24 hours ago
    document.getElementById('startTime').value = formatDateTime(startTime);
    document.getElementById('endTime').value = formatDateTime(now);
});

// Tab functionality
function setupTabs() {
    const tabButtons = document.querySelectorAll('.tab-btn');

    tabButtons.forEach(button => {
        button.addEventListener('click', function() {
            const tabName = this.getAttribute('data-tab');

            // Remove active class from all tabs and buttons
            document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));

            // Add active class to clicked button and corresponding content
            this.classList.add('active');
            document.getElementById(tabName + '-tab').classList.add('active');

            // Load data for the tab
            if (tabName === 'persons') loadPersons();
            if (tabName === 'events') loadEvents();
        });
    });
}

// API Health Check
async function checkAPIHealth() {
    try {
        const response = await fetch('/api/health');
        const data = await response.json();

        const statusEl = document.getElementById('apiStatus');
        const indicator = statusEl.querySelector('.status-indicator');
        const text = statusEl.querySelector('.status-text');

        if (data.status === 'healthy') {
            indicator.classList.add('connected');
            text.textContent = 'Connected to airaFace API';
        } else {
            indicator.classList.add('disconnected');
            text.textContent = 'API Disconnected';
        }
    } catch (error) {
        console.error('Health check failed:', error);
        const statusEl = document.getElementById('apiStatus');
        statusEl.querySelector('.status-indicator').classList.add('disconnected');
        statusEl.querySelector('.status-text').textContent = 'API Disconnected';
    }
}

// Camera Management
async function loadCameras() {
    const grid = document.getElementById('cameraGrid');
    const select = document.getElementById('cameraSelect');

    try {
        // This is a placeholder - you'll need to implement the actual API endpoint
        // For now, we'll show a sample camera
        grid.innerHTML = `
            <div class="camera-card">
                <h3>📹 Camera 1</h3>
                <p><strong>Status:</strong> Active</p>
                <p><strong>Location:</strong> Main Entrance</p>
                <p><strong>IP:</strong> 192.168.1.101</p>
                <div class="actions">
                    <button class="btn btn-secondary" onclick="viewCamera('camera1')">View</button>
                    <button class="btn btn-danger">Delete</button>
                </div>
            </div>
            <div class="camera-card">
                <h3>📹 Camera 2</h3>
                <p><strong>Status:</strong> Active</p>
                <p><strong>Location:</strong> Back Door</p>
                <p><strong>IP:</strong> 192.168.1.102</p>
                <div class="actions">
                    <button class="btn btn-secondary" onclick="viewCamera('camera2')">View</button>
                    <button class="btn btn-danger">Delete</button>
                </div>
            </div>
        `;

        // Populate camera select
        select.innerHTML = '<option value="">Select a camera</option>';
        select.innerHTML += '<option value="camera1">Camera 1 - Main Entrance</option>';
        select.innerHTML += '<option value="camera2">Camera 2 - Back Door</option>';

    } catch (error) {
        console.error('Failed to load cameras:', error);
        grid.innerHTML = '<div class="loading">Failed to load cameras</div>';
    }
}

function viewCamera(cameraId) {
    document.getElementById('cameraSelect').value = cameraId;
    selectCamera();
}

function selectCamera() {
    const select = document.getElementById('cameraSelect');
    const cameraId = select.value;
    const overlay = document.getElementById('videoOverlay');
    const feed = document.getElementById('cameraFeed');

    if (!cameraId) {
        overlay.style.display = 'flex';
        feed.src = '';
        if (cameraRefreshInterval) {
            clearInterval(cameraRefreshInterval);
        }
        return;
    }

    currentCamera = cameraId;
    overlay.style.display = 'none';

    // Start camera feed
    updateCameraFeed();

    // Refresh camera feed every 1 second
    if (cameraRefreshInterval) {
        clearInterval(cameraRefreshInterval);
    }
    cameraRefreshInterval = setInterval(updateCameraFeed, 1000);
}

function updateCameraFeed() {
    const feed = document.getElementById('cameraFeed');
    // Add timestamp to prevent caching
    feed.src = `/api/camera/${currentCamera}/snapshot?t=${Date.now()}`;
}

// Person Management
async function loadPersons() {
    const tbody = document.querySelector('#personsTable tbody');

    try {
        const response = await fetch('/api/persons');

        // Placeholder data
        tbody.innerHTML = `
            <tr>
                <td>001</td>
                <td>John Doe</td>
                <td>EMP001</td>
                <td>
                    <button class="btn btn-secondary">Edit</button>
                    <button class="btn btn-danger">Delete</button>
                </td>
            </tr>
            <tr>
                <td>002</td>
                <td>Jane Smith</td>
                <td>EMP002</td>
                <td>
                    <button class="btn btn-secondary">Edit</button>
                    <button class="btn btn-danger">Delete</button>
                </td>
            </tr>
        `;
    } catch (error) {
        console.error('Failed to load persons:', error);
        tbody.innerHTML = '<tr><td colspan="4" class="loading">Failed to load persons</td></tr>';
    }
}

async function addPerson(event) {
    event.preventDefault();
    const form = event.target;
    const formData = new FormData(form);

    const personData = {
        fullname: formData.get('fullname'),
        employeeno: formData.get('employeeno')
    };

    try {
        const response = await fetch('/api/persons', {
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
            alert('Failed to add person: ' + (result.error || 'Unknown error'));
        }
    } catch (error) {
        console.error('Error adding person:', error);
        alert('Failed to add person');
    }
}

// Event Management
async function loadEvents() {
    const tbody = document.querySelector('#eventsTable tbody');

    // Placeholder data
    tbody.innerHTML = `
        <tr>
            <td>Recognition Alert</td>
            <td>HTTP</td>
            <td><span style="color: #4caf50;">✓ Enabled</span></td>
            <td>http://localhost:3000/webhook</td>
            <td>
                <button class="btn btn-secondary">Edit</button>
                <button class="btn btn-danger">Delete</button>
            </td>
        </tr>
    `;
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
        const response = await fetch('/api/events', {
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
            alert('Failed to create event: ' + (result.error || 'Unknown error'));
        }
    } catch (error) {
        console.error('Error creating event:', error);
        alert('Failed to create event');
    }
}

// Recognition Results
async function queryRecognitions() {
    const grid = document.getElementById('recognitionGrid');
    const startTime = document.getElementById('startTime').value;
    const endTime = document.getElementById('endTime').value;

    if (!startTime || !endTime) {
        alert('Please select start and end time');
        return;
    }

    grid.innerHTML = '<div class="loading">Loading recognitions...</div>';

    try {
        const params = new URLSearchParams({
            start_time: startTime,
            end_time: endTime
        });

        const response = await fetch(`/api/recognitions?${params}`);
        const data = await response.json();

        // Placeholder results
        grid.innerHTML = `
            <div class="recognition-card">
                <img src="https://via.placeholder.com/250x200" alt="Recognition">
                <div class="info">
                    <h4>John Doe</h4>
                    <p>Employee: EMP001</p>
                    <p>Camera: Main Entrance</p>
                    <p>Time: ${new Date().toLocaleString()}</p>
                    <span class="score high">Score: 0.95</span>
                </div>
            </div>
            <div class="recognition-card">
                <img src="https://via.placeholder.com/250x200" alt="Recognition">
                <div class="info">
                    <h4>Jane Smith</h4>
                    <p>Employee: EMP002</p>
                    <p>Camera: Back Door</p>
                    <p>Time: ${new Date().toLocaleString()}</p>
                    <span class="score high">Score: 0.89</span>
                </div>
            </div>
        `;
    } catch (error) {
        console.error('Failed to query recognitions:', error);
        grid.innerHTML = '<div class="loading">Failed to load recognitions</div>';
    }
}

// WebSocket for real-time recognitions
function toggleWebSocket() {
    const button = document.getElementById('wsToggle');
    const status = document.getElementById('wsStatus');

    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.close();
        button.textContent = 'Connect WebSocket';
        status.textContent = 'Disconnected';
        status.classList.remove('connected');
    } else {
        connectWebSocket();
    }
}

async function connectWebSocket() {
    const button = document.getElementById('wsToggle');
    const status = document.getElementById('wsStatus');

    try {
        // Get WebSocket URL from API
        const response = await fetch('/api/websocket/info');
        const data = await response.json();

        ws = new WebSocket(data.websocket_url);

        ws.onopen = function() {
            status.textContent = 'Connected';
            status.classList.add('connected');
            button.textContent = 'Disconnect WebSocket';
            console.log('WebSocket connected');
        };

        ws.onmessage = function(event) {
            const data = JSON.parse(event.data);
            displayLiveRecognition(data);
        };

        ws.onerror = function(error) {
            console.error('WebSocket error:', error);
            status.textContent = 'Connection Error';
            status.classList.remove('connected');
        };

        ws.onclose = function() {
            status.textContent = 'Disconnected';
            status.classList.remove('connected');
            button.textContent = 'Connect WebSocket';
            console.log('WebSocket disconnected');
        };
    } catch (error) {
        console.error('Failed to connect WebSocket:', error);
        alert('Failed to connect to WebSocket');
    }
}

function displayLiveRecognition(data) {
    const container = document.getElementById('liveRecognitions');

    // Remove placeholder text
    const placeholder = container.querySelector('.info-text');
    if (placeholder) placeholder.remove();

    const scoreClass = data.score >= 0.85 ? 'high' : (data.score >= 0.7 ? 'medium' : 'low');

    const card = document.createElement('div');
    card.className = 'recognition-card';
    card.innerHTML = `
        <img src="data:image/jpeg;base64,${data.snapshot}" alt="Recognition">
        <div class="info">
            <h4>${data.person_info?.fullname || 'Unknown'}</h4>
            <p>Employee: ${data.person_info?.employeeno || 'N/A'}</p>
            <p>Camera: ${data.channel}</p>
            <p>Time: ${new Date(data.timestamp).toLocaleString()}</p>
            <span class="score ${scoreClass}">Score: ${data.score.toFixed(2)}</span>
        </div>
    `;

    // Add new card at the beginning
    container.insertBefore(card, container.firstChild);

    // Keep only last 10 recognitions
    while (container.children.length > 10) {
        container.removeChild(container.lastChild);
    }
}

// Camera operations
async function addCamera(event) {
    event.preventDefault();
    const form = event.target;
    const formData = new FormData(form);

    const cameraData = {
        name: formData.get('name'),
        ip: formData.get('ip'),
        port: formData.get('port'),
        username: formData.get('username'),
        password: formData.get('password')
    };

    try {
        const response = await fetch('/api/cameras', {
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
            alert('Failed to add camera: ' + (result.error || 'Unknown error'));
        }
    } catch (error) {
        console.error('Error adding camera:', error);
        alert('Failed to add camera');
    }
}

// Modal functions
function showAddCameraModal() {
    document.getElementById('addCameraModal').style.display = 'block';
}

function showAddPersonModal() {
    document.getElementById('addPersonModal').style.display = 'block';
}

function showAddEventModal() {
    document.getElementById('addEventModal').style.display = 'block';
}

function closeModal(modalId) {
    document.getElementById(modalId).style.display = 'none';
}

// Close modal when clicking outside
window.onclick = function(event) {
    if (event.target.classList.contains('modal')) {
        event.target.style.display = 'none';
    }
}

// Utility functions
function formatDateTime(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');

    return `${year}-${month}-${day}T${hours}:${minutes}`;
}