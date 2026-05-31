# Driver Drowsiness and Yawn Detection

This project is a real-time driver drowsiness and yawn detection system using computer vision and deep learning. It uses a Convolutional Neural Network (CNN) trained to classify facial and eye states (open, closed, yawn, no yawn) to alert the driver when signs of fatigue or sleepiness are detected.

## Features

- Real-time webcam-based detection
- Eye state classification: Open vs Closed
- Custom CNN model trained on the Drowsiness dataset
- Yawn detection capability
- Alarm system using audio alert for drowsiness
- Efficient preprocessing using OpenCV
- Model export as `.h5` file for reuse

## Dataset

- Source: [Kaggle - Drowsiness Dataset](https://www.kaggle.com/datasets/dheerajperumandla/drowsiness-dataset)
- Classes:
  - `Closed`: Eyes closed
  - `Open`: Eyes open
  - `yawn`: Subject yawning
  - `no_yawn`: Subject not yawning

Each class is stored in a separate folder under the `/train` directory.

## Technologies Used

- Python 3.7+
- TensorFlow & Keras
- OpenCV
- playsound
- NumPy, Pillow


Make sure the Haar cascade XML files and the trained model (`drowsiness_model.h5`) are available in your project folder.

## File Structure
├── detect.py # Main script for detection
├── drowsiness_model.h5 # Trained model
├── data/
│ ├── alarm.mp3 # Alarm sound file
│ ├── haarcascade_frontalface_default.xml
│ ├── haarcascade_lefteye_2splits.xml
│ └── haarcascade_righteye_2splits.xml


## Usage

1. Clone this repository.
2. Ensure all dependencies are installed.
3. Place your trained model and Haar cascades in the designated folders.
4. Run the script:python detect.py


Close the camera window or press `q` to exit the detection system.

## How It Works

- The webcam captures real-time video frames.
- Haar cascade classifiers locate face and eye regions.
- Eye regions are grayscaled, resized to 64x64, and passed to a CNN model.
- If both eyes are classified as 'closed' for 10 consecutive frames, a sound alert is triggered.
- You can modify the threshold or add support for yawn detection with a similar logic.

## Credits

- Built using TensorFlow, Keras, OpenCV, and Python






