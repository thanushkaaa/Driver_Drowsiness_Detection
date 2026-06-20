import os
import base64
import numpy as np
import cv2
from flask import Flask, request, jsonify, render_template
from flask_cors import CORS

# Suppress TensorFlow warnings
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '3'
os.environ['TF_ENABLE_ONEDNN_OPTS'] = '0'

# We import keras/tensorflow inside helper functions or at startup.
# To ensure rapid startup and prevent loading blocks, we import tensorflow here.
print("Loading TensorFlow/Keras...")
import tensorflow as tf
from tensorflow import keras

app = Flask(__name__, template_folder='templates', static_folder='static')
CORS(app)

# Load Haar cascades
print("Loading Haar Cascades...")
face_cascade = cv2.CascadeClassifier("data/haarcascade_frontalface_default.xml")
left_eye_cascade = cv2.CascadeClassifier("data/haarcascade_lefteye_2splits.xml")
right_eye_cascade = cv2.CascadeClassifier("data/haarcascade_righteye_2splits.xml")

# Load model
model_path = "drowsiness_model.h5"
if os.path.exists(model_path):
    print(f"Loading trained model from {model_path}...")
    model = keras.models.load_model(model_path)
    print("Model loaded successfully.")
else:
    raise FileNotFoundError(f"Model file not found at {model_path}")

CLASSES = ['Closed', 'Open', 'no_yawn', 'yawn']

def decode_base64_image(base64_str):
    """
    Decodes a base64 encoded image string into an OpenCV BGR image.
    """
    if ',' in base64_str:
        base64_str = base64_str.split(',')[1]
    img_data = base64.b64decode(base64_str)
    nparr = np.frombuffer(img_data, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    return img

def preprocess_eye(eye_img):
    """
    Converts BGR eye region to a (1, 64, 64, 1) grayscale array for the model.
    """
    gray_eye = cv2.cvtColor(eye_img, cv2.COLOR_BGR2GRAY)
    resized_eye = cv2.resize(gray_eye, (64, 64))
    normalized_eye = resized_eye.astype('float32') / 255.0
    reshaped_eye = np.expand_dims(normalized_eye, axis=-1)    # (64, 64, 1)
    input_eye = np.expand_dims(reshaped_eye, axis=0)          # (1, 64, 64, 1)
    return input_eye

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/predict', methods=['POST'])
def predict():
    data = request.get_json()
    if not data or 'image' not in data:
        return jsonify({"error": "No image data provided"}), 400

    try:
        frame = decode_base64_image(data['image'])
        if frame is None:
            return jsonify({"error": "Failed to decode image"}), 400

        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        faces = face_cascade.detectMultiScale(gray, 1.3, 5)

        detected_faces = []

        for (x, y, w, h) in faces:
            roi_gray = gray[y:y+h, x:x+w]
            roi_color = frame[y:y+h, x:x+w]

            left_eyes = left_eye_cascade.detectMultiScale(roi_gray)
            right_eyes = right_eye_cascade.detectMultiScale(roi_gray)

            left_eye_data = {"status": "Not Detected", "bbox": None}
            right_eye_data = {"status": "Not Detected", "bbox": None}

            # Process Left Eye
            for (ex, ey, ew, eh) in left_eyes:
                eye_img = roi_color[ey:ey+eh, ex:ex+ew]
                if eye_img.size != 0:
                    input_eye = preprocess_eye(eye_img)
                    pred = model.predict(input_eye, verbose=0)
                    status_idx = np.argmax(pred)
                    # Maps 0: Closed, 1: Open, 2: no_yawn, 3: yawn
                    status = CLASSES[status_idx] if status_idx < len(CLASSES) else "Unknown"
                    
                    # Store bounding box relative to face ROI
                    left_eye_data = {
                        "status": status,
                        "bbox": [int(ex), int(ey), int(ew), int(eh)]
                    }
                break  # Only evaluate the first detected left eye

            # Process Right Eye
            for (ex, ey, ew, eh) in right_eyes:
                eye_img = roi_color[ey:ey+eh, ex:ex+ew]
                if eye_img.size != 0:
                    input_eye = preprocess_eye(eye_img)
                    pred = model.predict(input_eye, verbose=0)
                    status_idx = np.argmax(pred)
                    status = CLASSES[status_idx] if status_idx < len(CLASSES) else "Unknown"
                    
                    right_eye_data = {
                        "status": status,
                        "bbox": [int(ex), int(ey), int(ew), int(eh)]
                    }
                break  # Only evaluate the first detected right eye

            detected_faces.append({
                "bbox": [int(x), int(y), int(w), int(h)],
                "left_eye": left_eye_data,
                "right_eye": right_eye_data
            })

        return jsonify({
            "faces": detected_faces,
            "drowsiness_detected": any(
                f["left_eye"]["status"] == "Closed" and f["right_eye"]["status"] == "Closed"
                for f in detected_faces
            )
        })

    except Exception as e:
        print(f"Error during prediction: {e}")
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    # Run locally
    app.run(host='0.0.0.0', port=5000, debug=True)
