from flask import Flask, jsonify, request, render_template, Response
from flask_cors import CORS
import requests
import os
from dotenv import load_dotenv
from datetime import datetime, timedelta
import urllib3
import cv2
import numpy as np

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
load_dotenv()
app = Flask(__name__)
CORS(app)
app.config['SECRET_KEY'] = os.getenv('SECRET_KEY', 'dev-secret-key')

AIRA_CONFIG = {
    'protocol': os.getenv('AIRA_PROTOCOL', 'https'),
    'server_ip': os.getenv('AIRA_SERVER_IP', '192.168.1.100'),
    'port': os.getenv('AIRA_SERVER_PORT', '443'),
    'username': os.getenv('AIRA_USERNAME', 'admin'),
    'password': os.getenv('AIRA_PASSWORD', 'admin'),
}

AIRA_BASE_URL = f"{AIRA_CONFIG['protocol']}://{AIRA_CONFIG['server_ip']}:{AIRA_CONFIG['port']}/airafacelite"

token_storage = {
    'token': None,
    'expires_at': None
}

# In-memory camera storage
camera_storage = {}


# ============================================
# Helper Functions
# ============================================

def get_aira_token(force_refresh=False):
    """Generate or return cached airaFace API token"""
    now = datetime.now()

    # Return cached token if still valid
    if not force_refresh and token_storage['token'] and token_storage['expires_at']:
        if now < token_storage['expires_at']:
            return token_storage['token']

    # Generate new token
    try:
        response = requests.post(
            f"{AIRA_BASE_URL}/generatetoken",
            json={
                'username': AIRA_CONFIG['username'],
                'password': AIRA_CONFIG['password']
            },
            verify=False,
            timeout=10
        )
        if response.status_code == 200:
            data = response.json()
            token_storage['token'] = data.get('token')
            # Token expires in 1 hour, refresh 5 minutes before
            token_storage['expires_at'] = now + timedelta(minutes=55)
            return token_storage['token']
        else:
            raise Exception(f"Token generation failed: {response.status_code} - {response.text}")

    except requests.exceptions.RequestException as e:
        raise Exception(f"Failed to connect to airaFace API: {str(e)}")


def make_aira_request(method, endpoint, data=None, params=None):
    """Make authenticated request to airaFace API"""
    token = get_aira_token()
    headers = {'token': token}
    url = f"{AIRA_BASE_URL}{endpoint}"

    try:
        if method.upper() == 'GET':
            response = requests.get(url, headers=headers, params=params, verify=False, timeout=10)
        elif method.upper() == 'POST':
            response = requests.post(url, headers=headers, json=data, verify=False, timeout=10)
        elif method.upper() == 'PUT':
            response = requests.put(url, headers=headers, json=data, verify=False, timeout=10)
        elif method.upper() == 'DELETE':
            response = requests.delete(url, headers=headers, verify=False, timeout=10)
        else:
            return {'error': 'Invalid HTTP method'}, 400

        return response.json(), response.status_code

    except requests.exceptions.RequestException as e:
        return {'error': f'API request failed: {str(e)}'}, 500


def get_camera_stream(camera_url, username=None, password=None):
    """Open camera RTSP stream"""
    try:
        # Build RTSP URL with credentials if provided
        if username and password:
            # Format: rtsp://username:password@ip:port/path
            url_parts = camera_url.replace('rtsp://', '').split('/')
            host_part = url_parts[0]
            path_part = '/'.join(url_parts[1:]) if len(url_parts) > 1 else ''
            camera_url = f"rtsp://{username}:{password}@{host_part}/{path_part}"

        cap = cv2.VideoCapture(camera_url)

        if not cap.isOpened():
            return None

        return cap
    except Exception as e:
        print(f"Error opening camera stream: {e}")
        return None


# ============================================
# Main Routes
# ============================================

@app.route('/')
def index():
    """Render main dashboard"""
    return render_template('index.html')


@app.route('/api/health')
def health_check():
    """Check API health and airaFace connection"""
    try:
        token = get_aira_token()
        return jsonify({
            'status': 'healthy',
            'aira_api': 'connected',
            'token_valid': bool(token)
        })
    except Exception as e:
        return jsonify({
            'status': 'unhealthy',
            'aira_api': 'disconnected',
            'error': str(e)
        }), 500


@app.route('/api/token/refresh', methods=['POST'])
def refresh_token():
    """Manually refresh airaFace API token"""
    try:
        token = get_aira_token(force_refresh=True)
        return jsonify({
            'message': 'Token refreshed successfully',
            'token': token,
            'expires_at': token_storage['expires_at'].isoformat()
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ============================================
# Camera Access Routes
# ============================================

@app.route('/api/camera/<camera_id>/snapshot')
def get_camera_snapshot(camera_id):
    """Get single snapshot from camera"""
    try:
        camera = camera_storage.get(camera_id)
        if not camera:
            return jsonify({'error': 'Camera not found'}), 404

        cap = get_camera_stream(
            camera.get('url'),
            camera.get('username'),
            camera.get('password')
        )

        if cap is None:
            img = np.zeros((480, 640, 3), dtype=np.uint8)
            cv2.putText(img, 'Camera Offline', (200, 240),
                        cv2.FONT_HERSHEY_SIMPLEX, 1, (255, 255, 255), 2)
            _, buffer = cv2.imencode('.jpg', img)
            return Response(buffer.tobytes(), mimetype='image/jpeg')

        # Read frame
        ret, frame = cap.read()
        cap.release()

        if not ret:
            return jsonify({'error': 'Failed to capture frame'}), 500

        # Encode frame as JPEG
        _, buffer = cv2.imencode('.jpg', frame)

        return Response(buffer.tobytes(), mimetype='image/jpeg')

    except Exception as e:
        print(f"Error getting camera snapshot: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/camera/<camera_id>/stream')
def camera_stream(camera_id):
    """Stream camera video (MJPEG format)"""

    def generate_frames(camera_id):
        camera = camera_storage.get(camera_id)

        if not camera:
            while True:
                img = np.zeros((480, 640, 3), dtype=np.uint8)
                cv2.putText(img, 'Camera Not Configured', (150, 240),
                            cv2.FONT_HERSHEY_SIMPLEX, 1, (255, 255, 255), 2)
                _, buffer = cv2.imencode('.jpg', img)
                yield (b'--frame\r\n'
                       b'Content-Type: image/jpeg\r\n\r\n' + buffer.tobytes() + b'\r\n')
        else:
            cap = get_camera_stream(
                camera.get('url'),
                camera.get('username'),
                camera.get('password')
            )

            if cap is None:
                # Generate error frame
                img = np.zeros((480, 640, 3), dtype=np.uint8)
                cv2.putText(img, 'Camera Offline', (200, 240),
                            cv2.FONT_HERSHEY_SIMPLEX, 1, (255, 255, 255), 2)
                _, buffer = cv2.imencode('.jpg', img)
                yield (b'--frame\r\n'
                       b'Content-Type: image/jpeg\r\n\r\n' + buffer.tobytes() + b'\r\n')
                return

            try:
                while True:
                    ret, frame = cap.read()
                    if not ret:
                        break

                    # Encode frame
                    _, buffer = cv2.imencode('.jpg', frame)

                    # Yield frame in MJPEG format
                    yield (b'--frame\r\n'
                           b'Content-Type: image/jpeg\r\n\r\n' + buffer.tobytes() + b'\r\n')
            finally:
                cap.release()

    return Response(generate_frames(camera_id),
                    mimetype='multipart/x-mixed-replace; boundary=frame')


# ============================================
# Person Management Routes
# ============================================

@app.route('/api/persons', methods=['GET'])
def list_persons():
    """List all registered persons"""
    result, status = make_aira_request('GET',

                                       '/queryperson')
    return jsonify(result), status


@app.route('/api/persons', methods=['POST'])
def create_person():
    """Register a new person"""
    data = request.get_json()
    # Validate required fields
    if not data.get('fullname'):
        return jsonify({'error': 'fullname is required'}), 400

    result, status = make_aira_request('POST', '/createperson', data=data)
    return jsonify(result), status


@app.route('/api/persons/<person_id>', methods=['PUT'])
def modify_person(person_id):
    """Modify an existing person"""
    data = request.get_json()
    data['id'] = person_id  # Add person ID to request

    result, status = make_aira_request('POST', '/modifyperson', data=data)
    return jsonify(result), status


# ============================================
# Camera Management Routes
# ============================================

@app.route('/api/cameras', methods=['GET'])
def list_cameras():
    """List all registered cameras"""
    result, status = make_aira_request('GET', '/querycamera')
    return jsonify(result), status


@app.route('/api/cameras', methods=['POST'])
def create_camera():
    """Register a new camera/device"""
    data = request.get_json()

    # Store camera info locally for stream access
    camera_id = data.get('id', f"camera_{len(camera_storage) + 1}")
    camera_storage[camera_id] = {
        'url': data.get('url'),
        'username': data.get('username'),
        'password': data.get('password'),
        'name': data.get('name')
    }

    result, status = make_aira_request('POST', '/createcamera', data=data)
    return jsonify(result), status


@app.route('/api/cameras/<camera_id>', methods=['PUT'])
def modify_camera(camera_id):
    """Modify camera settings"""
    data = request.get_json()
    data['id'] = camera_id

    # Update local storage
    if camera_id in camera_storage:
        camera_storage[camera_id].update({
            'url': data.get('url', camera_storage[camera_id].get('url')),
            'username': data.get('username', camera_storage[camera_id].get('username')),
            'password': data.get('password', camera_storage[camera_id].get('password')),
            'name': data.get('name', camera_storage[camera_id].get('name'))
        })

    result, status = make_aira_request('POST', '/modifycamera', data=data)
    return jsonify(result), status


# ============================================
# Event Handler Routes
# ============================================

@app.route('/api/events', methods=['POST'])
def create_event():
    """Create HTTP event handler"""
    data = request.get_json()

    # Set default values
    event_data = {
        'action_type': 'http',
        'name': data.get('name', 'event_handler'),
        'enable': data.get('enable', True),
        'group_list': data.get('group_list', ['All Person']),
        'divice_groups': data.get('divice_groups', []),
        'temperature_trigger_rule': 0,
        'remarks': data.get('remarks', ''),
        'https': data.get('https', True),
        'method': data.get('method', 'GET'),
        'host': data.get('host', ''),
        'port': data.get('port', 80),
        'data_type': 'JSON',
        'language': 'en',
        'url': data.get('url', ''),
        'custom_data': data.get('custom_data', ''),
        'note': data.get('note', '')
    }

    result, status = make_aira_request('POST', '/createeventhandle', data=event_data)
    return jsonify(result), status


@app.route('/api/events/<event_id>', methods=['PUT'])
def modify_event(event_id):
    """Modify event handler"""
    data = request.get_json()
    data['id'] = event_id

    result, status = make_aira_request('POST', '/modifyeventhandle', data=data)
    return jsonify(result), status


# ============================================
# Recognition Routes
# ============================================

@app.route('/api/recognitions', methods=['GET'])
def query_recognitions():
    """Query recognition results"""
    # Get query parameters
    params = {
        'start_time': request.args.get('start_time'),
        'end_time': request.args.get('end_time'),
        'person_id': request.args.get('person_id'),
        'camera_id': request.args.get('camera_id')
    }

    # Remove None values
    params = {k: v for k, v in params.items() if v is not None}

    result, status = make_aira_request('GET', '/querypersonverifyresult', params=params)
    return jsonify(result), status


# ============================================
# WebSocket Information Route
# ============================================

@app.route('/api/websocket/info')
def websocket_info():
    """Provide WebSocket connection information for real-time events"""
    ws_url = f"ws://{AIRA_CONFIG['server_ip']}/airafacelite/verifyresults"

    return jsonify({
        'websocket_url': ws_url,
        'description': 'Connect to this WebSocket to receive real-time recognition events',
        'example_response': {
            'type': 1,
            'score': 0.87,
            'target_score': 0.85,
            'snapshot': 'base64_encoded_image',
            'channel': 'Camera-5',
            'timestamp': 1714623611025,
            'person_info': {
                'fullname': 'John Doe',
                'employeeno': 'A0001'
            }
        }
    })


# ============================================
# Error Handlers
# ============================================

@app.errorhandler(404)
def not_found(error):
    return jsonify({'error': 'Endpoint not found'}), 404


@app.errorhandler(500)
def internal_error(error):
    return jsonify({'error': 'Internal server error'}), 500


# ============================================
# Application Entry Point
# ============================================

if __name__ == '__main__':
    # Create necessary directories (fixed to use 'templates' plural)
    os.makedirs('templates', exist_ok=True)
    os.makedirs('static/css', exist_ok=True)
    os.makedirs('static/js', exist_ok=True)

    app.run(
        host='0.0.0.0',
        port=5000,
        debug=True
    )