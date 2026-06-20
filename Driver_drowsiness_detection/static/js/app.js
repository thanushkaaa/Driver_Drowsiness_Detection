// Aura-Guard Driver Drowsiness Detection Frontend Application
document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const video = document.getElementById('webcam');
    const canvas = document.getElementById('overlay-canvas');
    const ctx = canvas.getContext('2d');
    
    const btnStartCamera = document.getElementById('btn-start-camera');
    const btnToggleCamera = document.getElementById('btn-toggle-camera');
    const btnToggleTracking = document.getElementById('btn-toggle-tracking');
    const btnClearLogs = document.getElementById('btn-clear-logs');
    
    const valLeftEye = document.getElementById('val-left-eye');
    const valRightEye = document.getElementById('val-right-eye');
    const cardLeftEye = document.getElementById('card-left-eye');
    const cardRightEye = document.getElementById('card-right-eye');
    
    const fatigueProgress = document.getElementById('fatigue-progress');
    const fatigueCount = document.getElementById('fatigue-count');
    const fatigueLabel = document.getElementById('fatigue-label');
    const fatigueBar = document.getElementById('fatigue-bar');
    
    const rangeThreshold = document.getElementById('range-threshold');
    const valThreshold = document.getElementById('val-threshold');
    const switchSound = document.getElementById('switch-sound');
    const alarmAudio = document.getElementById('alarm-audio');
    const alarmOverlay = document.getElementById('alarm-overlay');
    
    const globalStatusDot = document.getElementById('global-status-dot');
    const globalStatusText = document.getElementById('global-status-text');
    const fpsBadge = document.getElementById('fps-badge');
    const logList = document.getElementById('log-list');
    const cameraPlaceholder = document.getElementById('camera-placeholder');
    const scannerLine = document.getElementById('scanner-line');

    // App State
    let isCameraActive = false;
    let isTrackingActive = false;
    let isProcessingFrame = false;
    let stream = null;
    let animationFrameId = null;
    
    let alarmThreshold = parseInt(rangeThreshold.value, 10);
    let consecutiveClosedFrames = 0;
    let lastApiCallTime = 0;
    const apiCallInterval = 200; // POST frame every 200ms (5 FPS)
    
    // FPS Counters
    let fpsCount = 0;
    let fpsLastTime = performance.now();
    let currentFPS = 0;

    // Track active face & eyes bounding boxes to draw smoothly between API frames
    let currentDetections = [];

    // Helper: Add item to Event Log
    function addLog(message, type = 'system') {
        const time = new Date().toLocaleTimeString();
        const logItem = document.createElement('div');
        logItem.className = `log-item ${type}`;
        logItem.innerHTML = `<span class="log-time">[${time}]</span> ${message}`;
        logList.appendChild(logItem);
        logList.scrollTop = logList.scrollHeight;
    }

    // Initialize Canvas Dimensions
    function adjustCanvasSize() {
        canvas.width = 640;
        canvas.height = 480;
    }
    adjustCanvasSize();

    // Start Camera Stream
    async function startCamera() {
        addLog("Initializing video stream...", "system");
        try {
            stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    width: { ideal: 640 },
                    height: { ideal: 480 },
                    facingMode: "user"
                },
                audio: false
            });
            
            video.srcObject = stream;
            
            // Wait for video metadata to load
            video.onloadedmetadata = () => {
                video.play();
                isCameraActive = true;
                isTrackingActive = true;
                
                // UI updates
                cameraPlaceholder.style.display = 'none';
                scannerLine.style.display = 'block';
                scannerLine.style.animation = 'scan 3s linear infinite';
                
                btnStartCamera.style.display = 'none';
                btnToggleCamera.disabled = false;
                btnToggleTracking.disabled = false;
                
                btnToggleTracking.innerHTML = '<i class="fa-solid fa-pause"></i> Pause Detector';
                
                updateGlobalStatus("ACTIVE", "green");
                addLog("Webcam stream started successfully.", "normal");
                
                // Start drawing loop
                animationFrameId = requestAnimationFrame(tick);
            };
        } catch (err) {
            console.error("Error accessing webcam:", err);
            addLog(`Webcam Error: ${err.message}`, "alert");
            updateGlobalStatus("CAMERA ERROR", "red");
        }
    }

    // Stop Camera Stream
    function stopCamera() {
        addLog("Stopping camera stream...", "system");
        if (stream) {
            stream.getTracks().forEach(track => track.stop());
        }
        if (animationFrameId) {
            cancelAnimationFrame(animationFrameId);
        }
        
        video.srcObject = null;
        isCameraActive = false;
        isTrackingActive = false;
        currentDetections = [];
        
        // Reset fatigue state
        consecutiveClosedFrames = 0;
        updateFatigueGauge();
        stopAlarm();
        
        // Reset eye status UI
        updateEyeStatus('left', 'N/A', 'unknown');
        updateEyeStatus('right', 'N/A', 'unknown');
        
        // UI updates
        cameraPlaceholder.style.display = 'flex';
        scannerLine.style.display = 'none';
        
        btnStartCamera.style.display = 'inline-flex';
        btnToggleCamera.disabled = true;
        btnToggleTracking.disabled = true;
        
        fpsBadge.textContent = "0 FPS";
        updateGlobalStatus("SYSTEM READY", "green");
        addLog("Webcam stream terminated.", "system");
        
        // Clear canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    }

    // Toggle Detector Tracking
    function toggleTracking() {
        if (!isCameraActive) return;
        
        isTrackingActive = !isTrackingActive;
        if (isTrackingActive) {
            btnToggleTracking.innerHTML = '<i class="fa-solid fa-pause"></i> Pause Detector';
            updateGlobalStatus("ACTIVE", "green");
            addLog("Detection monitoring resumed.", "system");
            scannerLine.style.display = 'block';
        } else {
            btnToggleTracking.innerHTML = '<i class="fa-solid fa-play"></i> Resume Detector';
            updateGlobalStatus("PAUSED", "orange");
            addLog("Detection monitoring paused.", "system");
            scannerLine.style.display = 'none';
            consecutiveClosedFrames = 0;
            updateFatigueGauge();
            stopAlarm();
            
            // Reset Eye Indicators
            updateEyeStatus('left', 'PAUSED', 'unknown');
            updateEyeStatus('right', 'PAUSED', 'unknown');
        }
    }

    // Update System Status Header Dot and Text
    function updateGlobalStatus(text, colorClass) {
        globalStatusText.textContent = text;
        globalStatusDot.className = `status-dot ${colorClass}`;
    }

    // Update Eye Card Status UI
    function updateEyeStatus(eye, status, stateClass) {
        const valElem = eye === 'left' ? valLeftEye : valRightEye;
        const cardElem = eye === 'left' ? cardLeftEye : cardRightEye;
        
        valElem.textContent = status;
        valElem.className = `stat-val status-${stateClass}`;
        
        // Apply glow classes to cards
        cardElem.style.borderColor = 
            stateClass === 'open' ? 'rgba(0, 255, 135, 0.2)' :
            stateClass === 'closed' ? 'rgba(255, 51, 102, 0.2)' : 'var(--border-card)';
    }

    // Update Fatigue Progress Circular Gauge & Linear Bar
    function updateFatigueGauge() {
        const percent = Math.min((consecutiveClosedFrames / alarmThreshold) * 100, 100);
        fatigueCount.textContent = consecutiveClosedFrames;
        
        // Color transition based on fatigue level
        let progressColor = 'var(--color-neon-blue)';
        let labelText = 'Normal';
        let labelClass = 'status-open';
        
        if (consecutiveClosedFrames >= alarmThreshold) {
            progressColor = 'var(--color-neon-red)';
            labelText = 'DROWSY!';
            labelClass = 'status-closed';
        } else if (consecutiveClosedFrames >= alarmThreshold * 0.6) {
            progressColor = 'var(--color-neon-orange)';
            labelText = 'Fatigue';
            labelClass = 'status-unknown';
        }
        
        fatigueLabel.textContent = labelText;
        fatigueLabel.className = `progress-label ${labelClass}`;
        
        // Update circular gauge background gradient
        fatigueProgress.style.background = `conic-gradient(${progressColor} ${percent * 3.6}deg, rgba(255, 255, 255, 0.05) 0deg)`;
        
        // Update horizontal progress bar fill
        fatigueBar.style.width = `${percent}%`;
        fatigueBar.style.backgroundColor = progressColor;
    }

    // Handle Alarm Siren Triggering
    function triggerAlarm() {
        if (alarmOverlay.classList.contains('active')) return; // Alarm already active
        
        addLog("CRITICAL: Drowsiness Alert Triggered!", "alert");
        updateGlobalStatus("WARNING: DROWSY", "red");
        alarmOverlay.classList.add('active');
        
        if (switchSound.checked) {
            alarmAudio.play().catch(err => {
                console.error("Audio playback failed:", err);
                addLog("Audio Alert blocked. Interact with page to enable sound.", "system");
            });
        }
    }

    // Stop Alarm Siren
    function stopAlarm() {
        if (!alarmOverlay.classList.contains('active')) return;
        
        alarmOverlay.classList.remove('active');
        alarmAudio.pause();
        alarmAudio.currentTime = 0;
        
        if (isCameraActive && isTrackingActive) {
            updateGlobalStatus("ACTIVE", "green");
            addLog("Alert resolved. Eyes detected open.", "normal");
        }
    }

    // Clear event logs
    btnClearLogs.addEventListener('click', () => {
        logList.innerHTML = '<div class="log-item system"><span class="log-time">[System]</span> Log cleared. Monitoring active...</div>';
    });

    // Handle Sensitivity Adjustments
    rangeThreshold.addEventListener('input', (e) => {
        alarmThreshold = parseInt(e.target.value, 10);
        valThreshold.textContent = alarmThreshold;
        updateFatigueGauge();
    });

    // Sound toggle state change
    switchSound.addEventListener('change', () => {
        if (!switchSound.checked) {
            alarmAudio.pause();
        } else if (alarmOverlay.classList.contains('active')) {
            alarmAudio.play().catch(e => console.error(e));
        }
    });

    // Main animation frame tick loop
    function tick(now) {
        if (!isCameraActive) return;
        
        // Draw the video frame mirrored to the canvas so it acts as a mirror
        ctx.save();
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        ctx.restore();
        
        // Calculate and display FPS
        fpsCount++;
        if (now - fpsLastTime >= 1000) {
            currentFPS = fpsCount;
            fpsBadge.textContent = `${currentFPS} FPS`;
            fpsCount = 0;
            fpsLastTime = now;
        }

        // Draw active detections overlays (persistent frame-by-frame)
        drawOverlays();

        // Perform prediction if tracking is enabled and not currently processing
        if (isTrackingActive && !isProcessingFrame && (now - lastApiCallTime >= apiCallInterval)) {
            captureAndPredict(now);
        }
        
        animationFrameId = requestAnimationFrame(tick);
    }

    // Capture Canvas frame and POST to API
    function captureAndPredict(now) {
        isProcessingFrame = true;
        lastApiCallTime = now;
        
        // Get frame as base64 JPEG from canvas (which contains the mirrored feed)
        const frameDataUrl = canvas.toDataURL('image/jpeg', 0.6);
        
        fetch('/predict', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image: frameDataUrl })
        })
        .then(response => {
            if (!response.ok) throw new Error(`HTTP Error ${response.status}`);
            return response.json();
        })
        .then(data => {
            isProcessingFrame = false;
            
            if (data.error) {
                console.error("API Error:", data.error);
                return;
            }
            
            // Save detections to be drawn on next ticks
            currentDetections = data.faces || [];
            
            // Process prediction results
            processDetections(currentDetections);
        })
        .catch(err => {
            isProcessingFrame = false;
            console.error("Fetch predict failed:", err);
        });
    }

    // Process face and eye detections to update state machines
    function processDetections(faces) {
        if (faces.length === 0) {
            // No faces detected in this frame
            updateEyeStatus('left', 'NO FACE', 'unknown');
            updateEyeStatus('right', 'NO FACE', 'unknown');
            
            // Reset closed-frame accumulation count
            if (consecutiveClosedFrames > 0) {
                consecutiveClosedFrames = 0;
                updateFatigueGauge();
                stopAlarm();
            }
            return;
        }

        // We focus on the first detected face (usually the driver)
        const driver = faces[0];
        const leftEye = driver.left_eye;
        const rightEye = driver.right_eye;

        // UI Eye Stats Card Updates
        const lStatus = leftEye.status;
        const rStatus = rightEye.status;
        
        const lClass = lStatus === 'Open' ? 'open' : (lStatus === 'Closed' ? 'closed' : 'unknown');
        const rClass = rStatus === 'Open' ? 'open' : (rStatus === 'Closed' ? 'closed' : 'unknown');
        
        updateEyeStatus('left', lStatus, lClass);
        updateEyeStatus('right', rStatus, rClass);

        // State Machine logic (both eyes must be closed for fatigue accumulation)
        if (lStatus === 'Closed' && rStatus === 'Closed') {
            consecutiveClosedFrames++;
            updateFatigueGauge();
            
            addLog(`Eyes Closed Detection (Counter: ${consecutiveClosedFrames})`, 'alert');
            
            if (consecutiveClosedFrames >= alarmThreshold) {
                triggerAlarm();
            }
        } else {
            // Reset if any eye is open (or not detected)
            if (consecutiveClosedFrames > 0) {
                consecutiveClosedFrames = 0;
                updateFatigueGauge();
                stopAlarm();
            }
        }
    }

    // Render Bounding Boxes overlay on top of frame
    function drawOverlays() {
        if (currentDetections.length === 0) return;

        currentDetections.forEach(face => {
            const [fx, fy, fw, fh] = face.bbox;

            // Draw Face Rectangle (Neon Blue)
            ctx.strokeStyle = '#00d2ff';
            ctx.lineWidth = 2;
            ctx.shadowColor = '#00d2ff';
            ctx.shadowBlur = 8;
            ctx.strokeRect(fx, fy, fw, fh);
            
            // Draw Face Label
            ctx.fillStyle = '#00d2ff';
            ctx.font = '10px Orbitron, sans-serif';
            ctx.shadowBlur = 0; // turn off shadow for text rendering
            ctx.fillText("DRIVER FACE DETECTED", fx, fy - 6);

            // Draw Left Eye Rectangle
            if (face.left_eye && face.left_eye.bbox) {
                const [lex, ley, lew, leh] = face.left_eye.bbox;
                // Eye coords are relative to Face bounding box, so convert to absolute
                const absX = fx + lex;
                const absY = fy + ley;
                
                const isClosed = face.left_eye.status === 'Closed';
                ctx.strokeStyle = isClosed ? '#ff3366' : '#00ff87';
                ctx.lineWidth = 1.5;
                ctx.shadowColor = ctx.strokeStyle;
                ctx.shadowBlur = 4;
                ctx.strokeRect(absX, absY, lew, leh);
                
                ctx.fillStyle = ctx.strokeStyle;
                ctx.font = '8px Orbitron, sans-serif';
                ctx.shadowBlur = 0;
                ctx.fillText(`L EYE: ${face.left_eye.status}`, absX, absY - 4);
            }

            // Draw Right Eye Rectangle
            if (face.right_eye && face.right_eye.bbox) {
                const [rex, rey, rew, reh] = face.right_eye.bbox;
                const absX = fx + rex;
                const absY = fy + rey;
                
                const isClosed = face.right_eye.status === 'Closed';
                ctx.strokeStyle = isClosed ? '#ff3366' : '#00ff87';
                ctx.lineWidth = 1.5;
                ctx.shadowColor = ctx.strokeStyle;
                ctx.shadowBlur = 4;
                ctx.strokeRect(absX, absY, rew, reh);
                
                ctx.fillStyle = ctx.strokeStyle;
                ctx.font = '8px Orbitron, sans-serif';
                ctx.shadowBlur = 0;
                ctx.fillText(`R EYE: ${face.right_eye.status}`, absX, absY - 4);
            }
        });
        
        // Reset shadow settings
        ctx.shadowBlur = 0;
    }

    // Button Click Handlers
    btnStartCamera.addEventListener('click', startCamera);
    btnToggleCamera.addEventListener('click', stopCamera);
    btnToggleTracking.addEventListener('click', toggleTracking);
});
