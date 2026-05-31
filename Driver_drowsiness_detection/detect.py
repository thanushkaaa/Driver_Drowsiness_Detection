import cv2
import numpy as np
import os
from threading import Thread
from tensorflow import keras
# from playsound import playsound  # Uncomment if you want audible alarm & playsound installed

# Optional: To suppress TensorFlow oneDNN warnings (optional)
os.environ['TF_ENABLE_ONEDNN_OPTS'] = '0'

# Alarm thread to play a warning sound
from playsound import playsound



class AlarmThread(Thread):
    def __init__(self, sound_path):
        super().__init__()
        self.sound_path = sound_path
        self.daemon = True

    def run(self):
        playsound(self.sound_path)


def preprocess_eye(eye_img):
    """
    Converts an RGB eye region to a (1, 64, 64, 1) grayscale array as required by the model.
    """
    # Convert BGR (OpenCV) to grayscale
    gray_eye = cv2.cvtColor(eye_img, cv2.COLOR_BGR2GRAY)
    resized_eye = cv2.resize(gray_eye, (64, 64))
    normalized_eye = resized_eye.astype('float32') / 255.0
    reshaped_eye = np.expand_dims(normalized_eye, axis=-1)    # Shape: (64, 64, 1)
    input_eye = np.expand_dims(reshaped_eye, axis=0)          # Shape: (1, 64, 64, 1)
    return input_eye

# Load Haar cascades for face and eye detection
face_cascade = cv2.CascadeClassifier("data/haarcascade_frontalface_default.xml")
left_eye_cascade = cv2.CascadeClassifier("data/haarcascade_lefteye_2splits.xml")
right_eye_cascade = cv2.CascadeClassifier("data/haarcascade_righteye_2splits.xml")

# Load the trained Keras model
model = keras.models.load_model("drowsiness_model.h5")

# Define class indices as per your training
classes = ['Closed', 'Open']

cap = cv2.VideoCapture(0)
count = 0
alarm_on = False
alarm_sound = "data/alarm.mp3"


print(os.path.exists(alarm_sound))  # Should print True

while True:
    ret, frame = cap.read()
    if not ret:
        break

    height = frame.shape[0]
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    faces = face_cascade.detectMultiScale(gray, 1.3, 5)

    status1 = status2 = None

    for (x, y, w, h) in faces:
        cv2.rectangle(frame, (x, y), (x+w, y+h), (255, 0, 0), 1)
        roi_gray = gray[y:y+h, x:x+w]
        roi_color = frame[y:y+h, x:x+w]

        left_eye = left_eye_cascade.detectMultiScale(roi_gray)
        right_eye = right_eye_cascade.detectMultiScale(roi_gray)

        # Left eye
        for (x1, y1, w1, h1) in left_eye:
            cv2.rectangle(roi_color, (x1, y1), (x1+w1, y1+h1), (0, 255, 0), 1)
            eye1 = roi_color[y1:y1+h1, x1:x1+w1]
            if eye1.size != 0:
                input_eye1 = preprocess_eye(eye1)
                pred1 = model.predict(input_eye1)
                status1 = np.argmax(pred1)
            break

        # Right eye
        for (x2, y2, w2, h2) in right_eye:
            cv2.rectangle(roi_color, (x2, y2), (x2+w2, y2+h2), (0, 255, 0), 1)
            eye2 = roi_color[y2:y2+h2, x2:x2+w2]
            if eye2.size != 0:
                input_eye2 = preprocess_eye(eye2)
                pred2 = model.predict(input_eye2)
                status2 = np.argmax(pred2)
            break

        # Both eyes closed
        if status1 == 0 and status2 == 0:
            count += 1
            cv2.putText(frame, f"Eyes Closed, Frame count: {count}", (10, 30), cv2.FONT_HERSHEY_COMPLEX, 1, (0, 0, 255), 1)
            if count >= 10:
                cv2.putText(frame, "Drowsiness Alert!!!", (100, height-20), cv2.FONT_HERSHEY_COMPLEX, 1, (0, 0, 255), 2)
                if not alarm_on:
                    alarm_on = True
                    t = AlarmThread(alarm_sound)
                    t.start()
        else:
            cv2.putText(frame, "Eyes Open", (10, 30), cv2.FONT_HERSHEY_COMPLEX, 1, (0, 255, 0), 1)
            count = 0
            alarm_on = False

    cv2.imshow("Drowsiness Detector", frame)
    if cv2.waitKey(1) & 0xFF == ord('q'):
        break

cap.release()
cv2.destroyAllWindows()
