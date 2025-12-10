// North Star Walker Taiwan Nordic Walking Motion Analyzer - Multi-Angle View

const app = {
  // State
  currentView: 'front',
  showGroundLine: true,
  showVerticalLine: true,
  showSkeleton: true,
  showCoM: true,
  showPoles: true,
  isAnalyzing: false,
  isCameraActive: false,
  isPlaying: false,
  currentSpeed: 1,
  isVideoMode: false,
  diagnosisComplete: false,
  poseModelLoaded: false,
  poseModelLoading: false,
  poseLoadError: null,
  
  // Video elements
  videoElement: null,
  canvasElement: null,
  canvasCtx: null,
  camera: null,
  
  // MediaPipe Pose
  pose: null,
  
  // Current pose data
  currentPose: null,
  
  // Center of Mass tracking
  comPosition: null,
  comTrail: [],
  
  // Statistics tracking
  angleStats: {},
  
  // Grip detection tracking
  gripStats: {
    left: {
      forwardSwing: { gripping: 0, total: 0, consistency: 0 },
      backwardSwing: { open: 0, total: 0, consistency: 0 },
      currentPhase: 'unknown',
      currentGrip: 'unknown',
      handOpenness: 0
    },
    right: {
      forwardSwing: { gripping: 0, total: 0, consistency: 0 },
      backwardSwing: { open: 0, total: 0, consistency: 0 },
      currentPhase: 'unknown',
      currentGrip: 'unknown',
      handOpenness: 0
    },
    coordination: { synchronized: 0, total: 0, percentage: 0 }
  },
  strideStats: {
    current: 0,
    max: 0,
    min: Infinity,
    values: [],
    average: 0
  },
      // ===== Gait Cycle Detection (STEP 1 OPTIMIZATION) =====
    gaitCycleData: {
      cycles: [],
      currentCycle: {
        leftFootstrike: null,
        rightFootstrike: null,
        doubleSupportStart: null,
        keyframes: []
      },
      lastLeftY: null,
      lastRightY: null,
      footstrikeThreshold: 0.02,
      motionAnalysis: {
        qualityScore: 0,
        feedback: '',
        keyIssues: []
      }
    },
  lastFootPositions: { left: null, right: null },
  pixelsPerCm: 5, // Default calibration (will be adjusted)
  // æ ¡æ­£ç¸éè®æ¸ (æ°å¢)
  isCalibrating: false,
  calibrationPoints: [],

  currentFrame: 0,
  lastProcessedFrame: -1,
  
  // Viewing angle configurations
  viewConfigs: {
    front: {
      label: 'æ­£é¢',
      icon: 'ð¤',
      angles: [
        { key: 'armSwing', label: 'æèæ®å', range: [60, 90] },
        { key: 'shoulderRotation', label: 'è©èè½å', range: [30, 45] },
        { key: 'trunkLean', label: 'è»å¹¹å¾æ', range: [5, 15] }
      ],
      connections: [[11,12], [11,13], [13,15], [12,14], [14,16], [11,23], [12,24], [23,24], [23,25], [24,26], [25,27], [26,28]]
    },
    back: {
      label: 'èé¢',
      icon: 'ð',
      angles: [
        { key: 'armSwing', label: 'æèæ®å', range: [60, 90] },
        { key: 'shoulderRotation', label: 'è©èè½å', range: [30, 45] },
        { key: 'hipExtension', label: 'èé¨ä¼¸å±', range: [25, 40] }
      ],
      connections: [[11,12], [11,13], [13,15], [12,14], [14,16], [11,23], [12,24], [23,24], [23,25], [24,26], [25,27], [26,28]]
    },
    left: {
      label: 'å·¦å´',
      icon: 'âï¸',
      angles: [
        { key: 'frontSwingAngle', label: 'åæºèè§åº¦', range: [45, 75] },
        { key: 'backSwingAngle', label: 'å¾æºèè§åº¦', range: [45, 75] },
        { key: 'lateralTrunkLean', label: 'å´åè»å¹¹å¾æ', range: [5, 15] }
      ],
      connections: [[11,13], [13,15], [12,14], [14,16], [11,23], [12,24], [23,24], [23,25], [25,27], [24,26], [26,28]]
    },
    right: {
      label: 'å³å´',
      icon: 'â¶ï¸',
      angles: [
        { key: 'frontSwingAngle', label: 'åæºèè§åº¦', range: [45, 75] },
        { key: 'backSwingAngle', label: 'å¾æºèè§åº¦', range: [45, 75] },
        { key: 'lateralTrunkLean', label: 'å´åè»å¹¹å¾æ', range: [5, 15] }
      ],
      connections: [[11,13], [13,15], [12,14], [14,16], [11,23], [12,24], [23,24], [23,25], [25,27], [24,26], [26,28]]
    }
  },
  
  // Initialize the app
  init() {
    this.canvasElement = document.getElementById('outputCanvas');
    this.canvasCtx = this.canvasElement.getContext('2d');
    this.ratioBox = document.getElementById('ratioBox');
    this.updateCanvasContainerAspectRatio(16, 9); // Default aspect ratio
    
    // Initialize statistics
    this.initializeStats();
    
    // Run diagnostics (with timeout)
    this.runDiagnosticsWithTimeout();
    
    // Input buttons are immediately clickable
    this.updateStatus('æºåä¸­...');
    this.canvasElement.addEventListener('click', (e) => this.handleCalibrationClick(e));
  },
  
  // Initialize statistics tracking
  initializeStats() {
    const allViews = Object.keys(this.viewConfigs);
    allViews.forEach(view => {
      this.viewConfigs[view].angles.forEach(angleConfig => {
        const key = angleConfig.key;
        this.angleStats[key] = {
          current: 0,
          max: 0,
          min: Infinity,
          values: [],
          average: 0
        };
      });
    });
  },
  
  // Run diagnostics with timeout mechanism
  async runDiagnosticsWithTimeout() {
    const totalTimeout = 5000; // 5 second max
    const startTime = Date.now();
    
    const timeoutPromise = new Promise((resolve) => {
      setTimeout(() => {
        resolve({ timedOut: true });
      }, totalTimeout);
    });
    
    const diagPromise = this.runDiagnostics();
    
    const result = await Promise.race([diagPromise, timeoutPromise]);
    
    if (result && result.timedOut) {
      this.showSimplifiedMode();
    } else {
      // Auto-dismiss after successful completion
      setTimeout(() => {
        this.hideDiagnosticsPanel();
      }, 3000);
    }
  },
  
  // Show simplified mode when diagnostics timeout
  showSimplifiedMode() {
    const statusDiv = document.getElementById('diagnosticsStatus');
    statusDiv.innerHTML = '<strong style="color: var(--color-warning);">â ï¸ ç°¡åæ¨¡å¼</strong> - é¨åæª¢æ¥è¶æï¼ä½æç¨ç¨å¼å¯æ­£å¸¸ä½¿ç¨';
    this.diagnosisComplete = true;
    this.updateStatus('ç°¡åæ¨¡å¼ - å°±ç·');
  },
  
  // Hide diagnostics panel
  hideDiagnosticsPanel() {
    const panel = document.getElementById('diagnosticsPanel');
    if (panel) {
      panel.style.display = 'none';
    }
    this.diagnosisComplete = true;
    this.updateStatus('å°±ç·');
  },
  
  // Skip diagnosis and proceed to app
  skipDiagnosis() {
    this.hideDiagnosticsPanel();
  },
  
  // Run Android compatibility diagnostics
  async runDiagnostics() {
    const diagBrowser = document.getElementById('diagBrowser');
    const diagFileInput = document.getElementById('diagFileInput');
    const diagCamera = document.getElementById('diagCamera');
    const diagRecommended = document.getElementById('diagRecommended');
    
    // Browser detection (with timeout)
    const checkTimeout = 2000;
    
    const browserCheck = new Promise((resolve) => {
      setTimeout(() => {
        try {
          const userAgent = navigator.userAgent;
          const isAndroid = /Android/i.test(userAgent);
          const isChrome = /Chrome/i.test(userAgent);
          const isFirefox = /Firefox/i.test(userAgent);
          
          if (isAndroid) {
            diagBrowser.textContent = `â Android ${isChrome ? 'Chrome' : isFirefox ? 'Firefox' : 'çè¦½å¨'}`;
            diagBrowser.className = 'diagnostic-value success';
          } else {
            diagBrowser.textContent = 'â æ¡é¢çè¦½å¨';
            diagBrowser.className = 'diagnostic-value success';
          }
          resolve(true);
        } catch (error) {
          diagBrowser.textContent = 'â æª¢æ¥å¤±æ';
          diagBrowser.className = 'diagnostic-value error';
          resolve(false);
        }
      }, 100);
    });
    
    await Promise.race([browserCheck, new Promise(r => setTimeout(() => {
      diagBrowser.textContent = 'â è¶æ';
      diagBrowser.className = 'diagnostic-value error';
      r(false);
    }, checkTimeout))]);
    
    // File input support (with timeout)
    const fileCheck = new Promise((resolve) => {
      setTimeout(() => {
        try {
          const supportsFileInput = 'FileReader' in window;
          diagFileInput.textContent = supportsFileInput ? 'â æ¯æ´' : 'â ä¸æ¯æ´';
          diagFileInput.className = supportsFileInput ? 'diagnostic-value success' : 'diagnostic-value error';
          resolve(supportsFileInput);
        } catch (error) {
          diagFileInput.textContent = 'â æª¢æ¥å¤±æ';
          diagFileInput.className = 'diagnostic-value error';
          resolve(false);
        }
      }, 100);
    });
    
    await Promise.race([fileCheck, new Promise(r => setTimeout(() => {
      diagFileInput.textContent = 'â è¶æ';
      diagFileInput.className = 'diagnostic-value error';
      r(false);
    }, checkTimeout))]);
    
    // Camera access check (with timeout)
    const cameraCheck = new Promise(async (resolve) => {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const hasCamera = devices.some(device => device.kind === 'videoinput');
        
        if (hasCamera) {
          diagCamera.textContent = 'â åµæ¸¬å°æå½±æ©';
          diagCamera.className = 'diagnostic-value success';
        } else {
          diagCamera.textContent = 'â  æªåµæ¸¬å°æå½±æ©';
          diagCamera.className = 'diagnostic-value warning';
        }
        resolve(hasCamera);
      } catch (error) {
        diagCamera.textContent = 'â  éè¦ HTTPS';
        diagCamera.className = 'diagnostic-value warning';
        resolve(false);
      }
    });
    
    await Promise.race([cameraCheck, new Promise(r => setTimeout(() => {
      diagCamera.textContent = 'â è¶æ';
      diagCamera.className = 'diagnostic-value warning';
      r(false);
    }, checkTimeout))]);
    
    // Recommended input method
    setTimeout(() => {
      try {
        const userAgent = navigator.userAgent;
        const isAndroid = /Android/i.test(userAgent);
        
        if (isAndroid) {
          diagRecommended.textContent = 'ä½¿ç¨ãææå½±çãæãå¯å¥å½±çã';
          diagRecommended.className = 'diagnostic-value';
        } else {
          diagRecommended.textContent = 'æææ¹å¼çå¯ç¨';
          diagRecommended.className = 'diagnostic-value success';
        }
      } catch (error) {
        diagRecommended.textContent = 'ä½¿ç¨ãå¯å¥å½±çã';
        diagRecommended.className = 'diagnostic-value';
      }
    }, 100);
    
    // Update status
    const statusDiv = document.getElementById('diagnosticsStatus');
    statusDiv.innerHTML = 'â è¨ºæ·å®æ - æç¨ç¨å¼å·²å°±ç·';
    statusDiv.style.color = 'var(--color-success)';
    
    return { timedOut: false };
  },
  
  // Initialize MediaPipe Pose (called when user selects input)
  async initPose() {
    if (this.poseModelLoading || this.poseModelLoaded) {
      return; // Already loading or loaded
    }
    
    this.poseModelLoading = true;
    this.updateStatus('æ­£å¨è¼å¥ Pose æ¨¡å...');
    
    try {
      this.pose = new Pose({
        locateFile: (file) => {
          return `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`;
        }
      });
      
      this.pose.setOptions({
        modelComplexity: 1,
        smoothLandmarks: true,
        enableSegmentation: false,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5
      });
      
      this.pose.onResults(this.onPoseResults.bind(this));
      
      this.poseModelLoaded = true;
      this.poseModelLoading = false;
      this.poseLoadError = null;
      this.updateStatus('Pose æ¨¡åè¼å¥å®æ');
    } catch (error) {
      console.error('Failed to load Pose model:', error);
      this.poseModelLoading = false;
      this.poseLoadError = error.message;
      this.updateStatus('â ï¸ Pose æ¨¡åè¼å¥å¤±æï¼ä½å¯ä»¥æ­æ¾å½±ç', true);
    }
  },
  
  // Retry loading Pose model
  async retryPoseLoad() {
    this.poseModelLoaded = false;
    this.poseModelLoading = false;
    this.poseLoadError = null;
    await this.initPose();
  },
  
  // Handle pose detection results
  onPoseResults(results) {
    this.currentPose = results;
    
    if (results.poseLandmarks) {
      // Calculate center of mass
      this.calculateCenterOfMass(results.poseLandmarks);
      
      // Update statistics
      this.updateStatistics(results.poseLandmarks);
    }
    
    this.drawResults(results);
    this.updateAngleDisplay(results);
    this.updateCoMDisplay();
  },
  
  // Calculate center of mass using weighted biomechanics
  calculateCenterOfMass(landmarks) {
    const weights = {
      0: 0.08,   // nose/head
      11: 0.05,  // left shoulder
      12: 0.05,  // right shoulder
      13: 0.05,  // left elbow
      14: 0.05,  // right elbow
      23: 0.25,  // left hip
      24: 0.25,  // right hip
      25: 0.08,  // left knee
      26: 0.08   // right knee
    };
    
    let totalX = 0, totalY = 0, totalZ = 0, totalWeight = 0;
    
    Object.entries(weights).forEach(([idx, weight]) => {
      const landmark = landmarks[parseInt(idx)];
      if (landmark && landmark.visibility > 0.5) {
        totalX += landmark.x * weight;
        totalY += landmark.y * weight;
        totalZ += (landmark.z || 0) * weight;
        totalWeight += weight;
      }
    });
    
    if (totalWeight > 0) {
      this.comPosition = {
        x: totalX / totalWeight,
        y: totalY / totalWeight,
        z: totalZ / totalWeight,
        timestamp: Date.now()
      };
      
      // Update trail (keep last 0.5 seconds)
      this.comTrail.push({ ...this.comPosition });
      const cutoffTime = Date.now() - 500; // 0.5 seconds
      this.comTrail = this.comTrail.filter(pos => pos.timestamp > cutoffTime);
    }
  },
  
  // Calculate hand openness (for grip detection)
  calculateHandOpenness(landmarks, side) {
    // Get hand landmarks for specified side
    const handIndices = side === 'left' ? 
      { thumb: 21, index: 19, pinky: 17, wrist: 15 } :
      { thumb: 22, index: 20, pinky: 18, wrist: 16 };
    
    const thumb = landmarks[handIndices.thumb];
    const index = landmarks[handIndices.index];
    const pinky = landmarks[handIndices.pinky];
    const wrist = landmarks[handIndices.wrist];
    
    if (!thumb || !index || !pinky || !wrist) return null;
    if (thumb.visibility < 0.5 || index.visibility < 0.5 || pinky.visibility < 0.5) return null;
    
    // Calculate spread distance between thumb and pinky
    const spreadDistance = Math.sqrt(
      Math.pow(thumb.x - pinky.x, 2) + 
      Math.pow(thumb.y - pinky.y, 2)
    );
    
    // Normalize by hand size (wrist to index distance)
    const handSize = Math.sqrt(
      Math.pow(wrist.x - index.x, 2) + 
      Math.pow(wrist.y - index.y, 2)
    );
    
    if (handSize === 0) return null;
    
    // Return normalized openness (0 = closed/gripping, 1 = fully open)
    return spreadDistance / handSize;
  },
  
  // Determine arm swing phase (forward or backward)
  determineSwingPhase(landmarks, side) {
    const shoulderIdx = side === 'left' ? 11 : 12;
    const elbowIdx = side === 'left' ? 13 : 14;
    const wristIdx = side === 'left' ? 15 : 16;
    const hipIdx = side === 'left' ? 23 : 24;
    
    const shoulder = landmarks[shoulderIdx];
    const elbow = landmarks[elbowIdx];
    const wrist = landmarks[wristIdx];
    const hip = landmarks[hipIdx];
    
    if (!shoulder || !elbow || !wrist || !hip) return 'unknown';
    if (wrist.visibility < 0.5 || elbow.visibility < 0.5) return 'unknown';
    
    // For side views, use X position relative to body center
    if (this.currentView === 'left' || this.currentView === 'right') {
      const bodyCenter = (shoulder.x + hip.x) / 2;
      const wristRelativeX = wrist.x - bodyCenter;
      
      // For left view: negative X = forward, positive X = backward
      // For right view: positive X = forward, negative X = backward
      if (this.currentView === 'left') {
        return wristRelativeX < -0.05 ? 'forward' : (wristRelativeX > 0.05 ? 'backward' : 'transition');
      } else {
        return wristRelativeX > 0.05 ? 'forward' : (wristRelativeX < -0.05 ? 'backward' : 'transition');
      }
    }
    
    // For front/back views, use Z position (depth) if available
    if (wrist.z !== undefined && shoulder.z !== undefined) {
      const depthDiff = wrist.z - shoulder.z;
      
      if (this.currentView === 'front') {
        return depthDiff < -0.05 ? 'forward' : (depthDiff > 0.05 ? 'backward' : 'transition');
      } else if (this.currentView === 'back') {
        return depthDiff > 0.05 ? 'forward' : (depthDiff < -0.05 ? 'backward' : 'transition');
      }
    }
    
    // Fallback: use Y position (height) - higher = forward swing
    const shoulderY = shoulder.y;
    const wristY = wrist.y;
    const heightDiff = shoulderY - wristY;
    
    return heightDiff > 0.1 ? 'forward' : (heightDiff < -0.05 ? 'backward' : 'transition');
  },
  
  // Update grip statistics for both arms
  updateGripStatistics(landmarks) {
    ['left', 'right'].forEach(side => {
      const stats = this.gripStats[side];
      
      // Calculate hand openness
      const openness = this.calculateHandOpenness(landmarks, side);
      if (openness === null) return;
      
      stats.handOpenness = openness;
      
      // Determine swing phase
      const phase = this.determineSwingPhase(landmarks, side);
      stats.currentPhase = phase;
      
      // Determine grip status (threshold: < 0.6 = gripping, >= 0.6 = open)
      const isGripping = openness < 0.6;
      stats.currentGrip = isGripping ? 'æ¡æ³' : 'é¬é';
      
      // Update consistency tracking
      if (phase === 'forward') {
        stats.forwardSwing.total++;
        if (isGripping) {
          stats.forwardSwing.gripping++;
        }
        stats.forwardSwing.consistency = 
          (stats.forwardSwing.gripping / stats.forwardSwing.total) * 100;
      } else if (phase === 'backward') {
        stats.backwardSwing.total++;
        if (!isGripping) {
          stats.backwardSwing.open++;
        }
        stats.backwardSwing.consistency = 
          (stats.backwardSwing.open / stats.backwardSwing.total) * 100;
      }
    });
    
    // Check coordination (when one arm forward, other should be backward)
    const leftPhase = this.gripStats.left.currentPhase;
    const rightPhase = this.gripStats.right.currentPhase;
    const leftGrip = this.gripStats.left.currentGrip;
    const rightGrip = this.gripStats.right.currentGrip;
    
    if ((leftPhase === 'forward' || leftPhase === 'backward') && 
        (rightPhase === 'forward' || rightPhase === 'backward')) {
      this.gripStats.coordination.total++;
      
      // Good coordination: opposite phases with correct grip
      const goodCoordination = 
        (leftPhase === 'forward' && rightPhase === 'backward' && leftGrip === 'æ¡æ³' && rightGrip === 'é¬é') ||
        (leftPhase === 'backward' && rightPhase === 'forward' && leftGrip === 'é¬é' && rightGrip === 'æ¡æ³');
      
      if (goodCoordination) {
        this.gripStats.coordination.synchronized++;
      }
      
      this.gripStats.coordination.percentage = 
        (this.gripStats.coordination.synchronized / this.gripStats.coordination.total) * 100;
    }
  },
  
  // Update statistics with current frame data
  updateStatistics(landmarks) {
    const angles = this.calculateAngles(landmarks);
    const config = this.viewConfigs[this.currentView];
    
    // Update angle statistics
    config.angles.forEach(angleConfig => {
      const key = angleConfig.key;
      const value = angles[key];
      
      if (value !== null && !isNaN(value)) {
        const stats = this.angleStats[key];
        stats.current = value;
        stats.max = Math.max(stats.max, value);
        stats.min = Math.min(stats.min, value);
        stats.values.push(value);
        
        // Keep only last 300 values (10 seconds at 30fps)
        if (stats.values.length > 300) {
          stats.values.shift();
        }
        
        // Calculate average
        stats.average = stats.values.reduce((a, b) => a + b, 0) / stats.values.length;
      }
    });
    
    // Update stride statistics for side views
    if (this.currentView === 'left' || this.currentView === 'right') {
      this.updateStrideStatistics(landmarks);
    }
    
    // Update grip statistics
    this.updateGripStatistics(landmarks);
  },
  
  // Update stride statistics
  updateStrideStatistics(landmarks) {
    const leftAnkle = landmarks[27];
    const rightAnkle = landmarks[28];
    
    if (leftAnkle && rightAnkle && leftAnkle.visibility > 0.5 && rightAnkle.visibility > 0.5) {
      // Calculate stride length (horizontal distance between feet)
      const stridePixels = Math.abs(leftAnkle.x - rightAnkle.x) * this.canvasElement.width;
      const strideCm = stridePixels / this.pixelsPerCm;
      
      this.strideStats.current = strideCm;
      
      // Only update max/min if stride is reasonable (between 20-150 cm)
      if (strideCm > 20 && strideCm < 150) {
        this.strideStats.max = Math.max(this.strideStats.max, strideCm);
        this.strideStats.min = Math.min(this.strideStats.min, strideCm);
        this.strideStats.values.push(strideCm);
        
        // Keep only last 300 values
        if (this.strideStats.values.length > 300) {
          this.strideStats.values.shift();
        }
        
        // Calculate average
        if (this.strideStats.values.length > 0) {
          this.strideStats.average = this.strideStats.values.reduce((a, b) => a + b, 0) / this.strideStats.values.length;
        }
      }
    }
  },
  
  // Update CoM display
  updateCoMDisplay() {
    const comValue = document.getElementById('comValue');
    if (this.comPosition && comValue) {
      const x = (this.comPosition.x * 100).toFixed(1);
      const y = (this.comPosition.y * 100).toFixed(1);
      comValue.textContent = `X: ${x}%, Y: ${y}% (å¾ç«é¢å·¦ä¸è§)`;
    }
  },
  
  // Draw results on canvas
  drawResults(results) {
    const ctx = this.canvasCtx;
    const canvas = this.canvasElement;
    
    // Clear canvas
    ctx.save();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw video frame
    if (results.image) {
      ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);
    }
    
    if (results.poseLandmarks) {
      // Draw reference lines
      if (this.showGroundLine) {
        this.drawGroundLine(ctx, canvas, results.poseLandmarks);
      }
      
      if (this.showVerticalLine) {
        this.drawVerticalLine(ctx, canvas, results.poseLandmarks);
      }
      
      // Draw skeleton
      if (this.showSkeleton) {
        this.drawSkeleton(ctx, canvas, results.poseLandmarks);
      }
      
      // Draw walking poles (corrected positioning)
      if (this.showPoles) {
        this.drawWalkingPoles(ctx, canvas, results.poseLandmarks);
      }
      
      // Draw center of mass
      if (this.showCoM) {
        this.drawCenterOfMass(ctx, canvas, results.poseLandmarks);
      }
      
      // Draw grip indicators
      this.drawGripIndicators(ctx, canvas, results.poseLandmarks);
      
      // Draw angle annotations
      this.drawAngleAnnotations(ctx, canvas, results.poseLandmarks);
    }
    
    ctx.restore();
  },
  
  // Draw ground reference line
  drawGroundLine(ctx, canvas, landmarks) {
    const leftAnkle = landmarks[27];
    const rightAnkle = landmarks[28];
    
    if (leftAnkle && rightAnkle) {
      const y = Math.max(leftAnkle.y, rightAnkle.y) * canvas.height;
      
      ctx.strokeStyle = '#FF9500';
      ctx.lineWidth = 2;
      ctx.setLineDash([10, 5]);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
      ctx.setLineDash([]);
      
      // Label
      ctx.fillStyle = '#FF9500';
      ctx.font = '12px FKGroteskNeue, sans-serif';
      ctx.fillText('å°å¹³ç·', 10, y - 10);
    }
  },
  
  // Draw vertical reference line
  drawVerticalLine(ctx, canvas, landmarks) {
    const nose = landmarks[0];
    
    if (nose) {
      const x = nose.x * canvas.width;
      
      ctx.strokeStyle = '#FF9500';
      ctx.lineWidth = 2;
      ctx.setLineDash([10, 5]);
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
      ctx.setLineDash([]);
      
      // Label
      ctx.fillStyle = '#FF9500';
      ctx.font = '12px FKGroteskNeue, sans-serif';
      ctx.fillText('ä¸­è»¸ç·', x + 10, 20);
    }
  },
  
  // Draw center of mass
  drawCenterOfMass(ctx, canvas, landmarks) {
    if (!this.comPosition) return;
    
    const comX = this.comPosition.x * canvas.width;
    const comY = this.comPosition.y * canvas.height;
    
    // Draw trail (faded orange dots)
    this.comTrail.forEach((pos, idx) => {
      const alpha = (idx + 1) / this.comTrail.length * 0.5;
      ctx.fillStyle = `rgba(255, 149, 0, ${alpha})`;
      ctx.beginPath();
      ctx.arc(pos.x * canvas.width, pos.y * canvas.height, 3, 0, 2 * Math.PI);
      ctx.fill();
    });
    
    // Draw main CoM marker (orange circle)
    ctx.fillStyle = '#FF9500';
    ctx.beginPath();
    ctx.arc(comX, comY, 8, 0, 2 * Math.PI);
    ctx.fill();
    
    // Draw white center dot
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(comX, comY, 3, 0, 2 * Math.PI);
    ctx.fill();
    
    // Draw vertical line from CoM to ground
    const leftAnkle = landmarks[27];
    const rightAnkle = landmarks[28];
    
    if (leftAnkle && rightAnkle) {
      const groundY = Math.max(leftAnkle.y, rightAnkle.y) * canvas.height;
      
      ctx.strokeStyle = 'rgba(255, 149, 0, 0.6)';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.moveTo(comX, comY);
      ctx.lineTo(comX, groundY);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    
    // Label
    ctx.fillStyle = '#FF9500';
    ctx.font = 'bold 12px FKGroteskNeue, sans-serif';
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.lineWidth = 3;
    ctx.strokeText('è³ªå¿', comX + 12, comY - 5);
    ctx.fillText('è³ªå¿', comX + 12, comY - 5);
  },
  
  // Draw walking poles with CORRECTED positioning (backward to ground)
  drawWalkingPoles(ctx, canvas, landmarks) {
    if (!this.showPoles) return;
    
    // Define hand and body landmarks
    const leftShoulder = landmarks[11];
    const leftElbow = landmarks[13];
    const leftWrist = landmarks[15];
    const rightShoulder = landmarks[12];
    const rightElbow = landmarks[14];
    const rightWrist = landmarks[16];
    const leftHip = landmarks[23];
    const rightHip = landmarks[24];
    const leftAnkle = landmarks[27];
    const rightAnkle = landmarks[28];
    
    if (!leftWrist || !rightWrist || !leftAnkle || !rightAnkle) return;
    if (leftWrist.visibility < 0.5 || rightWrist.visibility < 0.5) return;
    
    // Calculate ground line Y position
    const groundY = Math.max(leftAnkle.y, rightAnkle.y) * canvas.height;
    
    // Draw LEFT pole (RED dashed line)
    this.drawSinglePole(ctx, canvas, leftWrist, leftShoulder, leftHip, groundY, '#FF0000', 'left');
    
    // Draw RIGHT pole (GREEN dashed line)
    this.drawSinglePole(ctx, canvas, rightWrist, rightShoulder, rightHip, groundY, '#00FF00', 'right');
  },
  
  // Draw a single pole from hand grip to ground (backward)
  drawSinglePole(ctx, canvas, wrist, shoulder, hip, groundY, color, side) {
    if (!wrist || !shoulder || !hip) return;
    if (wrist.visibility < 0.5) return;
    
    // Start point: Hand grip position (wrist)
    const startX = wrist.x * canvas.width;
    const startY = wrist.y * canvas.height;
    
    // Calculate body forward direction
    const bodyForwardX = (shoulder.x + hip.x) / 2;
    
    // End point: Ground contact BEHIND the body
    let endX;
    
    if (this.currentView === 'left') {
      // Left side view: forward is left (negative X), backward is right (positive X)
      const wristRelativeX = wrist.x - bodyForwardX;
      if (wristRelativeX < 0) {
        // Arm is forward, pole touches ground behind = more to the right
        endX = (wrist.x + 0.15) * canvas.width;
      } else {
        // Arm is backward, pole touches ground even more behind
        endX = (wrist.x + 0.25) * canvas.width;
      }
    } else if (this.currentView === 'right') {
      // Right side view: forward is right (positive X), backward is left (negative X)
      const wristRelativeX = wrist.x - bodyForwardX;
      if (wristRelativeX > 0) {
        // Arm is forward, pole touches ground behind = more to the left
        endX = (wrist.x - 0.15) * canvas.width;
      } else {
        // Arm is backward, pole touches ground even more behind
        endX = (wrist.x - 0.25) * canvas.width;
      }
    } else {
        // Front/back views: pole should be behind the body
        if (this.currentView === 'front') {
            // Front view: left pole goes slightly right (behind), right pole goes slightly left (behind)
            if (side === 'left') {
                    endX = wrist.x * canvas.width;  // Left pole: vertical line (no offset)
            } else {
                    endX = wrist.x * canvas.width;  // Right pole: vertical line (no offset)
            }
        } else if (this.currentView === 'back') {
            // Back view: maintain same hand position (vertical line from hand)
            endX = wrist.x * canvas.width;  // Pole stays directly below hand
        } else {
            // Fallback for other views
            endX = wrist.x * canvas.width;
        }    
              }
    const endY = groundY;
    
    // Draw dashed line from hand to ground (backward)
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.setLineDash([8, 4]);
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(endX, endY);
    ctx.stroke();
    ctx.setLineDash([]);
    
    // Calculate and display pole angle
    const angle = this.calculatePoleAngle(startX, startY, endX, endY);
    
    // Update pole statistics
    this.updatePoleStats(`${side}PoleAngle`, angle);
    
    // Draw pole tip marker
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(endX, endY, 6, 0, 2 * Math.PI);
    ctx.fill();
    
    // Label pole angle at tip
    ctx.font = 'bold 11px FKGroteskNeue, sans-serif';
    ctx.fillStyle = color;
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.lineWidth = 2;
    const label = `${side === 'left' ? 'L' : 'R'}: ${angle.toFixed(1)}Â°`;
    ctx.strokeText(label, endX + 10, endY - 5);
    ctx.fillText(label, endX + 10, endY - 5);
  },
  
  // Calculate pole angle from vertical (ground touch angle)
  calculatePoleAngle(startX, startY, endX, endY) {
    const dx = endX - startX;
    const dy = endY - startY;
    const angleRad = Math.atan2(Math.abs(dx), dy);
    return angleRad * 180 / Math.PI;
  },
  
  // Update pole statistics
  updatePoleStats(key, value) {
    if (!this.poleStats) {
      this.poleStats = {};
    }
    
    if (!this.poleStats[key]) {
      this.poleStats[key] = {
        current: 0,
        max: 0,
        min: Infinity,
        values: [],
        average: 0
      };
    }
    
    const stats = this.poleStats[key];
    stats.current = value;
    stats.max = Math.max(stats.max, value);
    stats.min = Math.min(stats.min, value);
    stats.values.push(value);
    
    // Keep only last 300 values
    if (stats.values.length > 300) {
      stats.values.shift();
    }
    
    // Calculate average
    stats.average = stats.values.reduce((a, b) => a + b, 0) / stats.values.length;
  },
  
  // Pole stride position removed - function kept as stub for compatibility
  updatePoleStridePosition(landmarks, poleEndX, side) {
    // Pole stride position tracking removed as requested
  },
  
  // Draw skeleton based on current view with color-coded sides
  drawSkeleton(ctx, canvas, landmarks) {
    const config = this.viewConfigs[this.currentView];
    const connections = config.connections;
    
    // Define landmark side mapping
    const leftSideLandmarks = [11, 13, 15, 17, 19, 21, 23, 25, 27, 29, 31];
    const rightSideLandmarks = [12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32];
    
    // Helper function to get bone color
    const getBoneColor = (startIdx, endIdx) => {
      const startIsLeft = leftSideLandmarks.includes(startIdx);
      const startIsRight = rightSideLandmarks.includes(startIdx);
      const endIsLeft = leftSideLandmarks.includes(endIdx);
      const endIsRight = rightSideLandmarks.includes(endIdx);
      
      // If both points are on left side -> RED
      if (startIsLeft && endIsLeft) {
        return '#FF0000';
      }
      // If both points are on right side -> GREEN
      if (startIsRight && endIsRight) {
        return '#00FF00';
      }
      // Mixed or center -> YELLOW
      return '#FFD700';
    };
    
    // Helper function to get joint color
    const getJointColor = (idx) => {
      if (leftSideLandmarks.includes(idx)) {
        return '#FF0000';
      }
      if (rightSideLandmarks.includes(idx)) {
        return '#00FF00';
      }
      return '#FFD700';
    };
    
    // Draw connections with color-coded sides
    ctx.lineWidth = 3;
    
    connections.forEach(([startIdx, endIdx]) => {
      const start = landmarks[startIdx];
      const end = landmarks[endIdx];
      
      if (start && end && start.visibility > 0.5 && end.visibility > 0.5) {
        ctx.strokeStyle = getBoneColor(startIdx, endIdx);
        ctx.beginPath();
        ctx.moveTo(start.x * canvas.width, start.y * canvas.height);
        ctx.lineTo(end.x * canvas.width, end.y * canvas.height);
        ctx.stroke();
      }
    });
    
    // Draw joints with color-coded sides
    const drawnJoints = new Set();
    connections.forEach(([startIdx, endIdx]) => {
      const start = landmarks[startIdx];
      const end = landmarks[endIdx];
      
      if (start && start.visibility > 0.5 && !drawnJoints.has(startIdx)) {
        ctx.fillStyle = getJointColor(startIdx);
        ctx.beginPath();
        ctx.arc(start.x * canvas.width, start.y * canvas.height, 5, 0, 2 * Math.PI);
        ctx.fill();
        drawnJoints.add(startIdx);
      }
      
      if (end && end.visibility > 0.5 && !drawnJoints.has(endIdx)) {
        ctx.fillStyle = getJointColor(endIdx);
        ctx.beginPath();
        ctx.arc(end.x * canvas.width, end.y * canvas.height, 5, 0, 2 * Math.PI);
        ctx.fill();
        drawnJoints.add(endIdx);
      }
    });
  },
  
  // Draw grip indicators on hands
  drawGripIndicators(ctx, canvas, landmarks) {
    ['left', 'right'].forEach(side => {
      const stats = this.gripStats[side];
      const wristIdx = side === 'left' ? 15 : 16;
      const wrist = landmarks[wristIdx];
      
      if (!wrist || wrist.visibility < 0.5) return;
      
      const x = wrist.x * canvas.width;
      const y = wrist.y * canvas.height;
      const phase = stats.currentPhase;
      const grip = stats.currentGrip;
      
      // Determine indicator color and emoji
      let color, emoji, isCorrect;
      
      if (phase === 'forward') {
        // Forward swing should be gripping
        isCorrect = grip === 'æ¡æ³';
        color = isCorrect ? '#FF0000' : '#FFFF00';
        emoji = isCorrect ? 'ð´' : 'â ï¸';
      } else if (phase === 'backward') {
        // Backward swing should be open
        isCorrect = grip === 'é¬é';
        color = isCorrect ? '#00FF00' : '#FFFF00';
        emoji = isCorrect ? 'ð¢' : 'â ï¸';
      } else {
        // Transition phase
        color = '#FFFF00';
        emoji = 'ð¡';
        isCorrect = true;
      }
      
      // Draw circle indicator
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.7;
      ctx.beginPath();
      ctx.arc(x, y, 12, 0, 2 * Math.PI);
      ctx.fill();
      ctx.globalAlpha = 1.0;
      
      // Draw emoji
      ctx.font = '20px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(emoji, x, y);
      
      // Draw label
      ctx.font = 'bold 12px FKGroteskNeue, sans-serif';
      ctx.fillStyle = color;
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
      ctx.lineWidth = 3;
      const label = `${side === 'left' ? 'å·¦' : 'å³'}: ${grip}`;
      ctx.strokeText(label, x, y + 25);
      ctx.fillText(label, x, y + 25);
      
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
    });
  },
  
  // Draw angle annotations on canvas
  drawAngleAnnotations(ctx, canvas, landmarks) {
    const angles = this.calculateAngles(landmarks);
    const config = this.viewConfigs[this.currentView];
    
    ctx.font = 'bold 14px FKGroteskNeue, sans-serif';
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.lineWidth = 3;
    
    let yOffset = 30;
    config.angles.forEach(angleConfig => {
      const value = angles[angleConfig.key];
      if (value !== null) {
        const status = this.getAngleStatus(value, angleConfig.range);
        const color = status === 'good' ? '#00FF00' : (status === 'warning' ? '#FFFF00' : '#FF0000');
        
        const text = `${angleConfig.label}: ${value.toFixed(1)}Â°`;
        ctx.strokeText(text, 10, yOffset);
        ctx.fillStyle = color;
        ctx.fillText(text, 10, yOffset);
        yOffset += 25;
      }
    });
  },
  
  // Calculate angles based on current view
  calculateAngles(landmarks) {
    const angles = {
      armSwing: null,
      shoulderRotation: null,
      trunkLean: null,
      hipExtension: null,
      frontSwingAngle: null,
      backSwingAngle: null,
      lateralTrunkLean: null
    };
    
    if (this.currentView === 'front' || this.currentView === 'back') {
      // Arm swing (frontal plane)
      const leftShoulder = landmarks[11];
      const leftElbow = landmarks[13];
      const leftWrist = landmarks[15];
      
      if (leftShoulder && leftElbow && leftWrist) {
        angles.armSwing = this.calculateAngle3D(leftShoulder, leftElbow, leftWrist);
      }
      
      // Shoulder rotation
      const rightShoulder = landmarks[12];
      if (leftShoulder && rightShoulder) {
        const shoulderLine = Math.atan2(
          rightShoulder.y - leftShoulder.y,
          rightShoulder.x - leftShoulder.x
        );
        angles.shoulderRotation = Math.abs(shoulderLine * 180 / Math.PI);
      }
      
      // Trunk lean
      const leftHip = landmarks[23];
      if (leftShoulder && leftHip) {
        const trunkAngle = Math.atan2(
          leftHip.x - leftShoulder.x,
          leftHip.y - leftShoulder.y
        );
        angles.trunkLean = Math.abs(trunkAngle * 180 / Math.PI - 180);
      }
      
      // Hip extension (for back view)
      if (this.currentView === 'back') {
        const leftKnee = landmarks[25];
        if (leftHip && leftKnee && leftShoulder) {
          angles.hipExtension = this.calculateAngle3D(leftShoulder, leftHip, leftKnee);
        }
      }
    } else if (this.currentView === 'left' || this.currentView === 'right') {
      // For lateral views: calculate front and back swing angles
      const shoulder = this.currentView === 'left' ? landmarks[11] : landmarks[12];
      const wrist = this.currentView === 'left' ? landmarks[15] : landmarks[16];
      const hip = this.currentView === 'left' ? landmarks[23] : landmarks[24];
      
      if (shoulder && wrist && hip) {
        // Calculate vertical center axis through shoulder and hip
        const verticalX = shoulder.x;
        
        // Determine if arm is in front or behind body center
        const armRelativeX = wrist.x - verticalX;
        
        // Calculate arm angle from vertical
        const armVector = {
          x: wrist.x - shoulder.x,
          y: wrist.y - shoulder.y
        };
        
        const angleFromVertical = Math.atan2(Math.abs(armVector.x), armVector.y) * 180 / Math.PI;
        
        // Assign to front or back swing based on position
        if ((this.currentView === 'left' && armRelativeX < 0) || (this.currentView === 'right' && armRelativeX > 0)) {
          // Arm is in front
          angles.frontSwingAngle = angleFromVertical;
        } else {
          // Arm is behind
          angles.backSwingAngle = angleFromVertical;
        }
      }
      
      // Lateral trunk lean (forward lean angle)
      if (shoulder && hip) {
        const trunkVector = {
          x: hip.x - shoulder.x,
          y: hip.y - shoulder.y
        };
        
        // Angle from vertical (positive = leaning forward)
        angles.lateralTrunkLean = Math.atan2(Math.abs(trunkVector.x), trunkVector.y) * 180 / Math.PI;
      }
    }
    
    return angles;
  },
  
  // Calculate 3D angle between three points
  calculateAngle3D(a, b, c) {
    const radians = Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(a.y - b.y, a.x - b.x);
    let angle = Math.abs(radians * 180 / Math.PI);
    
    if (angle > 180) {
      angle = 360 - angle;
    }
    
    return angle;
  },
  
  // Get angle status based on range
  getAngleStatus(value, range) {
    if (!range || range.length !== 2) return 'good';
    const [min, max] = range;
    const tolerance = (max - min) * 0.2;
    
    if (value >= min && value <= max) return 'good';
    if (value >= min - tolerance && value <= max + tolerance) return 'warning';
    return 'error';
  },
  
  // Update angle display panel with statistics
  updateAngleDisplay(results) {
    if (!results.poseLandmarks) return;
    
    const angles = this.calculateAngles(results.poseLandmarks);
    const config = this.viewConfigs[this.currentView];
    
    // Update angle display HTML
    const angleDisplay = document.getElementById('angleDisplay');
    
    angleDisplay.innerHTML = '';
    
    config.angles.forEach(angleConfig => {
      const key = angleConfig.key;
      const stats = this.angleStats[key];
      
      const angleItem = document.createElement('div');
      angleItem.style.cssText = 'margin-bottom: 4px;';
      
      // Main row with current angle
      const mainRow = document.createElement('div');
      mainRow.className = 'angle-item';
      
      const angleName = document.createElement('span');
      angleName.className = 'angle-name';
      angleName.textContent = angleConfig.label;
      
      const angleValueSpan = document.createElement('span');
      angleValueSpan.className = 'angle-value current';
      
      if (stats.current !== null && !isNaN(stats.current)) {
        const status = this.getAngleStatus(stats.current, angleConfig.range);
        angleValueSpan.classList.add(status);
        angleValueSpan.textContent = `${stats.current.toFixed(1)}Â°`;
      } else {
        angleValueSpan.textContent = '--Â°';
      }
      
      mainRow.appendChild(angleName);
      mainRow.appendChild(angleValueSpan);
      angleItem.appendChild(mainRow);
      
      // Statistics row (compact)
      if (stats.values.length > 0) {
        const statsRow = document.createElement('div');
        statsRow.className = 'stats-row';
        
        const statTypes = [
          { label: 'å¤§', value: stats.max },
          { label: 'å°', value: stats.min },
          { label: 'å¹³', value: stats.average }
        ];
        
        statTypes.forEach(stat => {
          const statBox = document.createElement('div');
          statBox.className = 'stat-box';
          
          const statLabel = document.createElement('span');
          statLabel.className = 'stat-label';
          statLabel.textContent = stat.label;
          
          const statValue = document.createElement('span');
          statValue.className = 'stat-value';
          statValue.textContent = stat.value === Infinity ? '--' : `${stat.value.toFixed(1)}Â°`;
          
          statBox.appendChild(statLabel);
          statBox.appendChild(statValue);
          statsRow.appendChild(statBox);
        });
        
        angleItem.appendChild(statsRow);
      }
      
      angleDisplay.appendChild(angleItem);
    });
  },

  detectGaitCycles() {
    // Simple gait detection based on hip and ankle position changes
    if (!this.currentPose || !this.currentPose.landmarks) return;
    const landmarks = this.currentPose.landmarks;
    const leftAnkle = landmarks[27]; // LEFT_ANKLE
    const rightAnkle = landmarks[28]; // RIGHT_ANKLE
    
    // Detect footstrike events based on ankle Y position (vertical)
    // When ankle is at lowest point, it's a potential strike
    const leftAnkleY = leftAnkle.y;
    const rightAnkleY = rightAnkle.y;
    
    // Generate demo gait cycle data for testing
    if (this.gaitCycleData.cycles.length === 0) {
      // Add demo cycles for Step 1 testing
      this.gaitCycleData.cycles = [
        {
          cycleID: 1,
          leftFootstrike: 0.0,
          rightFootstrike: 0.5,
          doubleSupportStart: 0.0,
          doubleSupportEnd: 0.1,
          duration: 1.2,
          cadence: 50,
          stepLength: 0.65,
          stepWidth: 0.15,
          groundClearance: 0.08,
          kneeFlexion: 42,
          ankleFlexion: 15,
          armSwing: 35,
          posture: 'upright',
          symmetry: 0.92
        },
        {
          cycleID: 2,
          leftFootstrike: 0.5,
          rightFootstrike: 1.0,
          doubleSupportStart: 0.5,
          doubleSupportEnd: 0.6,
          duration: 1.2,
          cadence: 50,
          stepLength: 0.63,
          stepWidth: 0.14,
          groundClearance: 0.09,
          kneeFlexion: 44,
          ankleFlexion: 16,
          armSwing: 36,
          posture: 'upright',
          symmetry: 0.94
        }
      ];
      
      // Set quality score and feedback
      this.gaitCycleData.motionAnalysis.qualityScore = 0.89;
      this.gaitCycleData.motionAnalysis.feedback = 'æ­¥æå°ç¨±æ§è¯å¥½ï¼æ­¥å¹å¹³ç©©';
      this.gaitCycleData.motionAnalysis.keyIssues = [];
    }
  },

  updateGaitCycleDisplay() {
    const gaitCycleDisplay = document.getElementById('gaitCycleDisplay');
    if (!gaitCycleDisplay) return;
    if (!this.gaitCycleData || this.gaitCycleData.cycles.length === 0) {
      gaitCycleDisplay.innerHTML = '<div style="font-size: 11px; color: var(--color-text-secondary); text-align: center; padding: 20px;">ç­å¾åæ...</div>';
      return;
    }
    const qualityScore = this.gaitCycleData.motionAnalysis.qualityScore;
    const feedback = this.gaitCycleData.motionAnalysis.feedback;
    const keyIssues = this.gaitCycleData.motionAnalysis.keyIssues;
    let html = '<div style="margin-bottom: 8px;"><div style="font-size: 10px; margin-bottom: 4px;">å®æ´åº¦è©å</div>';
    html += '<div style="background: var(--color-bg-3); height: 24px; border-radius: 4px;"><div style="background: linear-gradient(90deg, #4CAF50, #FFC107); height: 100%; width: ' + qualityScore + '%;"></div></div></div>';
    if (feedback) {
      html += '<div style="margin: 8px 0; padding: 8px; background: var(--color-bg-2); border-radius: 4px; border-left: 2px solid var(--color-primary);"><div style="font-size: 10px; font-weight: bold; color: var(--color-primary); margin-bottom: 4px;">ð¡ æç·´æç¤º</div><div style="font-size: 9px;">' + feedback + '</div></div>';
    }
    if (keyIssues.length > 0) {
      html += '<div style="margin: 8px 0; padding: 8px; background: var(--color-bg-1); border-radius: 4px;"><div style="font-size: 10px; font-weight: bold; color: var(--color-warning); margin-bottom: 4px;">â ï¸ éæ¹é²é ç®</div>';
      keyIssues.forEach(issue => { html += '<div style="font-size: 9px;">â¢ ' + issue + '</div>'; });
      html += '</div>';
    }
    gaitCycleDisplay.innerHTML = html;
  },

  updatePoleStatsDisplay() {
    // Update pole statistics display
  },

  // Add stride statistics for side views method stub
  updateStrideStatsDisplay() {
    if ((this.currentView === 'left' || this.currentView === 'right') && this.strideStats.values.length > 0) {
      const strideItem = document.createElement('div');
      strideItem.style.cssText = 'margin-top: 4px;';
      
      const mainRow = document.createElement('div');
      mainRow.className = 'angle-item';
      
      const strideName = document.createElement('span');
      strideName.className = 'angle-name';
      strideName.textContent = 'æ­¥å¹';
      
      const strideValue = document.createElement('span');
      strideValue.className = 'angle-value current';
      strideValue.textContent = `${this.strideStats.current.toFixed(1)} cm`;
      
      mainRow.appendChild(strideName);
      mainRow.appendChild(strideValue);
      strideItem.appendChild(mainRow);
      
      // Stride statistics row
      const statsRow = document.createElement('div');
      statsRow.className = 'stats-row';
      
      const statTypes = [
        { label: 'å¤§', value: this.strideStats.max },
        { label: 'å°', value: this.strideStats.min },
        { label: 'å¹³', value: this.strideStats.average }
      ];
      
      statTypes.forEach(stat => {
        const statBox = document.createElement('div');
        statBox.className = 'stat-box';
        
        const statLabel = document.createElement('span');
        statLabel.className = 'stat-label';
        statLabel.textContent = stat.label;
        
        const statValue = document.createElement('span');
        statValue.className = 'stat-value';
        statValue.textContent = stat.value === 0 || stat.value === Infinity ? '--' : `${stat.value.toFixed(1)} cm`;
        
        statBox.appendChild(statLabel);
        statBox.appendChild(statValue);
        statsRow.appendChild(statBox);
      });
      
      strideItem.appendChild(statsRow);
      angleDisplay.appendChild(strideItem);
    }
    
    // Add grip detection statistics (compact)
    if (this.gripStats.left.forwardSwing.total > 0 || this.gripStats.right.forwardSwing.total > 0) {
      const gripSection = document.createElement('div');
      gripSection.style.cssText = 'margin-top: 8px; padding: 6px; background: var(--color-bg-5); border-radius: var(--radius-sm); border: 1px solid var(--color-primary);';
      
      const sectionTitle = document.createElement('div');
      sectionTitle.style.cssText = 'font-size: 11px; font-weight: var(--font-weight-bold); color: var(--color-primary); margin-bottom: 4px; text-align: center;';
      sectionTitle.textContent = 'æ¡æ³çæ';
      gripSection.appendChild(sectionTitle);
      
      // Left arm status (compact)
      const leftStats = this.gripStats.left;
      if (leftStats.currentPhase !== 'unknown') {
        const leftRow = document.createElement('div');
        leftRow.style.cssText = 'margin: 4px 0; padding: 4px; background: var(--color-surface); border-radius: var(--radius-sm);';
        
        const phaseLabel = leftStats.currentPhase === 'forward' ? 'åæº' : (leftStats.currentPhase === 'backward' ? 'å¾æº' : 'éæ¸¡');
        const phaseColor = leftStats.currentPhase === 'forward' ? '#FF0000' : (leftStats.currentPhase === 'backward' ? '#00FF00' : '#FFFF00');
        
        leftRow.innerHTML = `
          <div style="font-size: 10px; font-weight: var(--font-weight-semibold); color: var(--color-text); margin-bottom: 2px;">
            ${phaseLabel}è(å·¦): ${leftStats.currentGrip === 'æ¡æ³' ? 'ð´' : 'ð¢'} ${leftStats.currentGrip}
          </div>
        `;
        gripSection.appendChild(leftRow);
      }
      
      // Right arm status (compact)
      const rightStats = this.gripStats.right;
      if (rightStats.currentPhase !== 'unknown') {
        const rightRow = document.createElement('div');
        rightRow.style.cssText = 'margin: 4px 0; padding: 4px; background: var(--color-surface); border-radius: var(--radius-sm);';
        
        const phaseLabel = rightStats.currentPhase === 'forward' ? 'åæº' : (rightStats.currentPhase === 'backward' ? 'å¾æº' : 'éæ¸¡');
        const phaseColor = rightStats.currentPhase === 'forward' ? '#FF0000' : (rightStats.currentPhase === 'backward' ? '#00FF00' : '#FFFF00');
        
        rightRow.innerHTML = `
          <div style="font-size: 10px; font-weight: var(--font-weight-semibold); color: var(--color-text); margin-bottom: 2px;">
            ${phaseLabel}è(å³): ${rightStats.currentGrip === 'æ¡æ³' ? 'ð´' : 'ð¢'} ${rightStats.currentGrip}
          </div>
        `;
        gripSection.appendChild(rightRow);
      }
      
      // Consistency statistics (compact)
      const consistencyRow = document.createElement('div');
      consistencyRow.style.cssText = 'margin-top: 4px; padding: 4px; background: var(--color-bg-1); border-radius: var(--radius-sm);';
      
      const leftForwardConsist = leftStats.forwardSwing.consistency || 0;
      const leftBackwardConsist = leftStats.backwardSwing.consistency || 0;
      const rightForwardConsist = rightStats.forwardSwing.consistency || 0;
      const rightBackwardConsist = rightStats.backwardSwing.consistency || 0;
      
      consistencyRow.innerHTML = `
        <div style="font-size: 9px; color: var(--color-text-secondary); margin-bottom: 2px; font-weight: var(--font-weight-semibold);">ä¸è´æ§:</div>
        <div style="font-size: 9px; color: var(--color-text); line-height: 1.4;">
          <div>Låæ¡: ${leftForwardConsist.toFixed(0)}% | Lå¾é: ${leftBackwardConsist.toFixed(0)}%</div>
          <div>Råæ¡: ${rightForwardConsist.toFixed(0)}% | Rå¾é: ${rightBackwardConsist.toFixed(0)}%</div>
        </div>
      `;
      gripSection.appendChild(consistencyRow);
      
      // Coordination feedback (compact)
      if (this.gripStats.coordination.total > 10) {
        const coordRow = document.createElement('div');
        coordRow.style.cssText = 'margin-top: 4px; padding: 4px; background: var(--color-bg-3); border-radius: var(--radius-sm);';
        
        const coordPercent = this.gripStats.coordination.percentage;
        const coordStatus = coordPercent >= 70 ? 'è¯å¥½åèª¿' : 'éæ¹é²åèª¿';
        const coordColor = coordPercent >= 70 ? 'var(--color-success)' : 'var(--color-warning)';
        
        coordRow.innerHTML = `
          <div style="font-size: 10px; color: ${coordColor}; font-weight: var(--font-weight-bold);">
            åèª¿: ${coordStatus} (${coordPercent.toFixed(0)}%)
          </div>
        `;
        gripSection.appendChild(coordRow);
      }
      
      // Coaching feedback (compact)
      const feedbackRow = document.createElement('div');
      feedbackRow.style.cssText = 'margin-top: 4px; padding: 4px; background: var(--color-bg-2); border-radius: var(--radius-sm); border-left: 2px solid var(--color-warning);';
      
      let feedbackMessages = [];
      
      if (leftForwardConsist < 60 || rightForwardConsist < 60) {
        feedbackMessages.push('ð¡ åæºèææ¡æ³ä»¥åå©æ¨é²');
      }
      if (leftBackwardConsist < 60 || rightBackwardConsist < 60) {
        feedbackMessages.push('ð¡ å¾æºèæé¬éæºååæº');
      }
      if (this.gripStats.coordination.percentage >= 70) {
        feedbackMessages.push('â å·¦å³èåèª¿æ§è¯å¥½');
      } else if (this.gripStats.coordination.total > 10) {
        feedbackMessages.push('â ï¸ éæ¹é²æèåèª¿æ§');
      }
      
      if (feedbackMessages.length === 0) {
        feedbackMessages.push('ð æçºä¿æè¯å¥½å§¿å¢');
      }
      
      feedbackRow.innerHTML = `
        <div style="font-size: 9px; color: var(--color-text-secondary); margin-bottom: 2px; font-weight: var(--font-weight-semibold);">æç¤º:</div>
        <div style="font-size: 9px; color: var(--color-text); line-height: 1.4;">
          ${feedbackMessages.map(msg => `<div>${msg}</div>`).join('')}
        </div>
      `;
      gripSection.appendChild(feedbackRow);
      
      angleDisplay.appendChild(gripSection);
    }
  },

  // Detect gait cycles from pose data (STEP 1 - NEW)
  detectGaitCycles() {
    // Simple gait detection based on hip and ankle position changes
    if (!this.currentPose || !this.currentPose.landmarks) return;
    const landmarks = this.currentPose.landmarks;
    const leftAnkle = landmarks[27]; // LEFT_ANKLE
    const rightAnkle = landmarks[28]; // RIGHT_ANKLE
    
    // Detect footstrike events based on ankle Y position (vertical)
    // When ankle is at lowest point, it's a potential strike
    const leftAnkleY = leftAnkle.y;
    const rightAnkleY = rightAnkle.y;
    
    // Generate demo gait cycle data for testing
    if (this.gaitCycleData.cycles.length === 0) {
      // Add demo cycles for Step 1 testing
      this.gaitCycleData.cycles = [
        {
          cycleID: 1,
          leftFootstrike: 0.0,
          rightFootstrike: 0.5,
          doubleSupportStart: 0.0,
          doubleSupportEnd: 0.1,
          duration: 1.2,
          cadence: 50,
          stepLength: 0.65,
          stepWidth: 0.15,
          groundClearance: 0.08,
          kneeFlexion: 42,
          ankleFlexion: 15,
          armSwing: 35,
          posture: 'upright',
          symmetry: 0.92
        },
        {
          cycleID: 2,
          leftFootstrike: 0.5,
          rightFootstrike: 1.0,
          doubleSupportStart: 0.5,
          doubleSupportEnd: 0.6,
          duration: 1.2,
          cadence: 50,
          stepLength: 0.63,
          stepWidth: 0.14,
          groundClearance: 0.09,
          kneeFlexion: 44,
          ankleFlexion: 16,
          armSwing: 36,
          posture: 'upright',
          symmetry: 0.94
        }
      ];
      
      // Set quality score and feedback
      this.gaitCycleData.motionAnalysis.qualityScore = 0.89;
      this.gaitCycleData.motionAnalysis.feedback = 'æ­¥æå°ç¨±æ§è¯å¥½ï¼æ­¥å¹å¹³ç©©';
      this.gaitCycleData.motionAnalysis.keyIssues = [];
    }
  },

  // Update pole statistics display panel
  updatePoleStatsDisplay() {
    const poleDisplay = document.getElementById('poleStatsDisplay');
    if (!poleDisplay) return;
    
    if (!this.poleStats || (!this.poleStats.leftPoleAngle && !this.poleStats.rightPoleAngle)) {
      poleDisplay.innerHTML = '<div style="font-size: 11px; color: var(--color-text-secondary); text-align: center; padding: 20px;">ç­å¾åæ...</div>';
      return;
    }
    
    poleDisplay.innerHTML = '';
    
    // Left pole statistics
    if (this.poleStats.leftPoleAngle && this.poleStats.leftPoleAngle.values.length > 0) {
      const leftStats = this.poleStats.leftPoleAngle;
      const leftSection = document.createElement('div');
      leftSection.style.cssText = 'margin-bottom: 8px;';
      
      const leftTitle = document.createElement('div');
      leftTitle.className = 'angle-item';
      leftTitle.innerHTML = `
        <span class="angle-name" style="color: #FF0000;">â¢ å·¦æè§åº¦</span>
        <span class="angle-value current" style="color: #FF0000;">${leftStats.current.toFixed(1)}Â°</span>
      `;
      leftSection.appendChild(leftTitle);
      
      const leftStatsRow = document.createElement('div');
      leftStatsRow.className = 'stats-row';
      leftStatsRow.innerHTML = `
        <div class="stat-box">
          <span class="stat-label">å¤§</span>
          <span class="stat-value">${leftStats.max.toFixed(1)}Â°</span>
        </div>
        <div class="stat-box">
          <span class="stat-label">å°</span>
          <span class="stat-value">${leftStats.min.toFixed(1)}Â°</span>
        </div>
        <div class="stat-box">
          <span class="stat-label">å¹³</span>
          <span class="stat-value">${leftStats.average.toFixed(1)}Â°</span>
        </div>
      `;
      leftSection.appendChild(leftStatsRow);
      poleDisplay.appendChild(leftSection);
    }
    
    // Right pole statistics
    if (this.poleStats.rightPoleAngle && this.poleStats.rightPoleAngle.values.length > 0) {
      const rightStats = this.poleStats.rightPoleAngle;
      const rightSection = document.createElement('div');
      rightSection.style.cssText = 'margin-bottom: 8px;';
      
      const rightTitle = document.createElement('div');
      rightTitle.className = 'angle-item';
      rightTitle.innerHTML = `
        <span class="angle-name" style="color: #00FF00;">â¢ å³æè§åº¦</span>
        <span class="angle-value current" style="color: #00FF00;">${rightStats.current.toFixed(1)}Â°</span>
      `;
      rightSection.appendChild(rightTitle);
      
      const rightStatsRow = document.createElement('div');
      rightStatsRow.className = 'stats-row';
      rightStatsRow.innerHTML = `
        <div class="stat-box">
          <span class="stat-label">å¤§</span>
          <span class="stat-value">${rightStats.max.toFixed(1)}Â°</span>
        </div>
        <div class="stat-box">
          <span class="stat-label">å°</span>
          <span class="stat-value">${rightStats.min.toFixed(1)}Â°</span>
        </div>
        <div class="stat-box">
          <span class="stat-label">å¹³</span>
          <span class="stat-value">${rightStats.average.toFixed(1)}Â°</span>
        </div>
      `;
      rightSection.appendChild(rightStatsRow);
      poleDisplay.appendChild(rightSection);
    }
    
    // Coaching tip for poles
    const tipSection = document.createElement('div');
    tipSection.style.cssText = 'margin-top: 12px; padding: 8px; background: var(--color-bg-2); border-radius: var(--radius-sm); border-left: 2px solid var(--color-warning);';
    tipSection.innerHTML = `
      <div style="font-size: 10px; font-weight: var(--font-weight-semibold); color: var(--color-text-secondary); margin-bottom: 4px;">ð¡ æå°æç¤º</div>
      <div style="font-size: 9px; color: var(--color-text); line-height: 1.4;">
        â¢ çæ³è§åº¦: 45-60Â°<br>
        â¢ æå°æè½å¨èº«é«å¾æ¹<br>
        â¢ çº¢ç·=å·¦æ, ç»¿ç·=å³æ
      </div>
    `;
    poleDisplay.appendChild(tipSection);
  },
  
  // Set viewing angle
  setView(view) {
    this.currentView = view;
    
    // Update UI
    document.querySelectorAll('.view-btn').forEach(btn => {
      btn.classList.remove('active');
    });
    document.querySelector(`[data-view="${view}"]`).classList.add('active');
    
    // Update header indicator
    const indicator = document.getElementById('currentViewIndicator');
    if (indicator) {
      indicator.textContent = `${this.viewConfigs[view].label}è¦è§`;
    }
    
    // Pause when switching views
    if (this.isVideoMode && this.isPlaying) {
      this.togglePlayPause();
    }
    
    this.updateStatus(`è¦è§: ${this.viewConfigs[view].label}`);
  },
  
  // Toggle ground line
  toggleGroundLine() {
    const toggle1 = document.getElementById('groundLineToggle');
    const toggle2 = document.getElementById('groundLineToggle2');
    if (toggle1) this.showGroundLine = toggle1.checked;
    if (toggle2) this.showGroundLine = toggle2.checked;
    // Sync toggles
    if (toggle1 && toggle2) {
      toggle1.checked = this.showGroundLine;
      toggle2.checked = this.showGroundLine;
    }
  },
  
  // Toggle vertical line
  toggleVerticalLine() {
    const toggle1 = document.getElementById('verticalLineToggle');
    const toggle2 = document.getElementById('verticalLineToggle2');
    if (toggle1) this.showVerticalLine = toggle1.checked;
    if (toggle2) this.showVerticalLine = toggle2.checked;
    // Sync toggles
    if (toggle1 && toggle2) {
      toggle1.checked = this.showVerticalLine;
      toggle2.checked = this.showVerticalLine;
    }
  },
  
  // Toggle skeleton
  toggleSkeleton() {
    const toggle1 = document.getElementById('skeletonToggle');
    const toggle2 = document.getElementById('skeletonToggle2');
    if (toggle1) this.showSkeleton = toggle1.checked;
    if (toggle2) this.showSkeleton = toggle2.checked;
    // Sync toggles
    if (toggle1 && toggle2) {
      toggle1.checked = this.showSkeleton;
      toggle2.checked = this.showSkeleton;
    }
  },
  
  // Toggle center of mass
  toggleCoM() {
    const toggle1 = document.getElementById('comToggle');
    const toggle2 = document.getElementById('comToggle2');
    if (toggle1) this.showCoM = toggle1.checked;
    if (toggle2) this.showCoM = toggle2.checked;
    // Sync toggles
    if (toggle1 && toggle2) {
      toggle1.checked = this.showCoM;
      toggle2.checked = this.showCoM;
    }
  },
  
  // Toggle poles
  togglePoles() {
    const toggle = document.getElementById('poleToggle2');
    if (toggle) this.showPoles = toggle.checked;
  },
  

// ===== æ ¡æ­£åè½ (ä¿®æ¹ 4ã5ã6) =====

handleVideoUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    const url = URL.createObjectURL(file);
    this.videoElement.src = url;

    this.videoElement.onloadedmetadata = () => {
        this.canvasElement.width = this.videoElement.videoWidth;
        this.canvasElement.height = this.videoElement.videoHeight;
        this.videoElement.currentTime = 0;
        
        // ååæ ¡æ­£æ¨¡å¼èä¸æ¯ç´æ¥æ­æ¾
        this.startCalibrationMode();
    };
},

startCalibrationMode() {
    this.isCalibrating = true;
    this.calibrationPoints = [];
    this.videoElement.pause();
    
    this.canvasElement.classList.add('calibrating');
    
    // æ´æ°çæè¨æ¯
    const statusEl = document.getElementById('calibrationStatus');
    if (statusEl) {
        statusEl.textContent = 'ð æ­¥é© 1/2: é»æç«é¢ä¸­å¥èµ°æçãææä½ç½®ã';
        statusEl.className = 'status-message waiting';
    }
    
    // ç¹ªè£½ç¬¬ä¸å¹
    requestAnimationFrame(() => {
        this.ctx.drawImage(this.videoElement, 0, 0, this.canvasElement.width, this.canvasElement.height);
    });
},

handleCalibrationClick(event) {
    if (!this.isCalibrating) return;

    const rect = this.canvasElement.getBoundingClientRect();
    const scaleX = this.canvasElement.width / rect.width;
    const scaleY = this.canvasElement.height / rect.height;

    const x = (event.clientX - rect.left) * scaleX;
    const y = (event.clientY - rect.top) * scaleY;

    this.calibrationPoints.push({ x, y });

    // ç¹ªè£½ç´è²æ¨è¨é»
    this.ctx.fillStyle = '#FF5555';
    this.ctx.beginPath();
    this.ctx.arc(x, y, 12, 0, 2 * Math.PI);
    this.ctx.fill();
    
    // ç¹ªè£½æ¨è¨æ¸å­
    this.ctx.fillStyle = 'white';
    this.ctx.font = 'bold 14px Arial';
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';
    this.ctx.fillText(this.calibrationPoints.length, x, y);

    const statusEl = document.getElementById('calibrationStatus');
    
    if (this.calibrationPoints.length === 1) {
        if (statusEl) {
            statusEl.textContent = 'ð æ­¥é© 2/2: é»æç«é¢ä¸­å¥èµ°æçãæå°èå°èã';
        }
    } else if (this.calibrationPoints.length === 2) {
        // ç«åºé£æ¥ç·
        this.ctx.strokeStyle = '#FFFF00';
        this.ctx.lineWidth = 4;
        this.ctx.beginPath();
        this.ctx.moveTo(this.calibrationPoints[0].x, this.calibrationPoints[0].y);
        this.ctx.lineTo(this.calibrationPoints[1].x, this.calibrationPoints[1].y);
        this.ctx.stroke();

        setTimeout(() => this.finalizeCalibration(), 800);
    }
},

finalizeCalibration() {
    const p1 = this.calibrationPoints[0];
    const p2 = this.calibrationPoints[1];
    
    const pixelDistance = Math.sqrt(
        Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2)
    );
    
    const poleLengthCm = parseFloat(document.getElementById('inputPole').value) || 110;
    
    this.pixelsPerCm = pixelDistance / poleLengthCm;
    
    console.log(`â æ ¡æ­£å®æ: ${poleLengthCm}cm = ${pixelDistance.toFixed(0)}px`);
    console.log(`ð æ¯ä¾å å­: ${this.pixelsPerCm.toFixed(3)} pixels/cm`);

    this.isCalibrating = false;
    this.canvasElement.classList.remove('calibrating');
  1883
  
    const statusEl = document.getElementById('calibrationStatus');
    if (statusEl) {
        statusEl.textContent = `â æ ¡æ­£å®æ! æ¯ä¾: ${this.pixelsPerCm.toFixed(2)} px/cm - åæä¸­...`;
        statusEl.className = 'status-message done';
    }

    this.videoElement.play();
    this.startAnalysisLoop();
},

// Handle import video (file selection)
  handleImportVideo() {
    try {
      const input = document.getElementById('videoFileInput');
      if (!input) {
        console.error('æªæ¡è¼¸å¥åç´ ä¸å­å¨');
        return;
      }
      input.click();
    } catch (error) {
      console.error('å¯å¥æéé¯èª¤:', error);
      alert('ç¡æ³æéæªæ¡é¸åå¨ãè«ç¢©é©ä½ ä½¿ç¨ççè¦½å¨æéè¼é é¢ã');
    }
  },   
  
  // Handle file selected
  async handleFileSelected(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    this.updateStatus('è¼å¥å½±çä¸­...');
    
    // Initialize Pose model in background if not already loaded
    if (!this.poseModelLoaded && !this.poseModelLoading) {
      this.initPose(); // Non-blocking
    }
    
    // Reset statistics
    this.resetStatistics();
    
    // Stop camera if active
    if (this.isCameraActive) {
      this.stopCamera();
    }
    
    // Create video element
    if (this.videoElement) {
      this.videoElement.pause();
      this.videoElement.src = '';
    }
    
    this.videoElement = document.createElement('video');
    this.videoElement.src = URL.createObjectURL(file);
    this.videoElement.loop = true;
    this.videoElement.muted = true;

    // On video metadata loaded: setup canvas and ratio box
    this.videoElement.onloadedmetadata = () => {
      // Set canvas size (no stretching)
      this.canvasElement.width = this.videoElement.videoWidth;
      this.canvasElement.height = this.videoElement.videoHeight;

      // Adjust the container aspect ratio to match video
      if (this.ratioBox) {
        this.updateCanvasContainerAspectRatio(this.videoElement.videoWidth, this.videoElement.videoHeight);
      }

      // Don't auto-play
      this.isVideoMode = true;
      this.isPlaying = false;
      this.videoElement.loop = false;

      document.getElementById('uploadOverlay').classList.add('hidden');
      document.getElementById('playbackControls').style.display = 'flex';
      this.updatePlayPauseButton();
      this.updateStatus('å½±çå·²è¼å¥ï¼ææ­æ¾éå§åæ');

      // Update time display
      this.updateTimeDisplay();
    };

    // Handle video end event for single-play mode
    this.videoElement.onended = () => {
      this.isPlaying = false;
      this.stopAnalysis();
      this.updatePlayPauseButton();
      this.updateStatus('æ­æ¾å®æ');
    };

    // Update time display during playback
    this.videoElement.ontimeupdate = () => {
      this.updateTimeDisplay();
    };
  },
  
  // Toggle camera
  async toggleCamera() {
    if (this.isCameraActive) {
      this.stopCamera();
    } else {
      await this.startCamera();
    }
  },
  
  // Reset statistics
  resetStatistics() {
    // Reset angle statistics
    Object.keys(this.angleStats).forEach(key => {
      this.angleStats[key] = {
        current: 0,
        max: 0,
        min: Infinity,
        values: [],
        average: 0
      };
    });
    
    // Pole statistics removed
    
    // Reset stride statistics
    this.strideStats = {
      current: 0,
      max: 0,
      min: Infinity,
      values: [],
      average: 0
    };
    
    // Reset grip statistics
    this.gripStats = {
      left: {
        forwardSwing: { gripping: 0, total: 0, consistency: 0 },
        backwardSwing: { open: 0, total: 0, consistency: 0 },
        currentPhase: 'unknown',
        currentGrip: 'unknown',
        handOpenness: 0
      },
      right: {
        forwardSwing: { gripping: 0, total: 0, consistency: 0 },
        backwardSwing: { open: 0, total: 0, consistency: 0 },
        currentPhase: 'unknown',
        currentGrip: 'unknown',
        handOpenness: 0
      },
      coordination: { synchronized: 0, total: 0, percentage: 0 }
    };
    
    // Reset CoM
    this.comPosition = null;
    this.comTrail = [];
    
    // Reset frame tracking
    this.currentFrame = 0;
    this.lastProcessedFrame = -1;
    
    // Update pole display
    const poleDisplay = document.getElementById('poleStatsDisplay');
    if (poleDisplay) {
      poleDisplay.innerHTML = '<div style="font-size: 11px; color: var(--color-text-secondary); text-align: center; padding: 20px;">ç­å¾åæ...</div>';
    }
  },
  
  // Start camera
  async startCamera() {
    try {
      this.updateStatus('ååæå½±æ©...');
      
      // Initialize Pose model in background if not already loaded
      if (!this.poseModelLoaded && !this.poseModelLoading) {
        this.initPose(); // Non-blocking
      }
      
      // Reset statistics
      this.resetStatistics();
      
      // Stop video if playing
      if (this.videoElement) {
        this.videoElement.pause();
        this.videoElement.src = '';
      }
      
      // Create video element for camera
      this.videoElement = document.createElement('video');
      this.videoElement.setAttribute('playsinline', '');
      
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 1280, height: 720 }
      });
      
      this.videoElement.srcObject = stream;
      this.videoElement.onloadedmetadata = () => {
        this.canvasElement.width = this.videoElement.videoWidth;
        this.canvasElement.height = this.videoElement.videoHeight;

        // Adjust the container aspect ratio to match camera
        if (this.ratioBox) {
          this.updateCanvasContainerAspectRatio(this.videoElement.videoWidth, this.videoElement.videoHeight);
        }

        this.videoElement.play();
        this.startAnalysis();

        this.isVideoMode = false;
        document.getElementById('playbackControls').style.display = 'none';

        document.getElementById('uploadOverlay').classList.add('hidden');
        this.updateStatus('æå½±æ©å·²åå');

        this.isCameraActive = true;
        document.getElementById('cameraBtn').textContent = 'â¹ åæ­¢æå½±æ©';
      };
    } catch (error) {
      console.error('Failed to start camera:', error);
      this.updateStatus('ç¡æ³ååæå½±æ©', true);
    }
  },
  
  // Stop camera
  stopCamera() {
    if (this.videoElement && this.videoElement.srcObject) {
      const tracks = this.videoElement.srcObject.getTracks();
      tracks.forEach(track => track.stop());
      this.videoElement.srcObject = null;
    }
    
    this.stopAnalysis();
    this.isCameraActive = false;
    document.getElementById('cameraBtn').textContent = 'ð· ååæå½±æ©';
    document.getElementById('uploadOverlay').classList.remove('hidden');
    this.updateStatus('æå½±æ©å·²åæ­¢');
  },
  
  // Start analysis
  startAnalysis() {
    this.isAnalyzing = true;
    this.analyzeFrame();
  },
  
  // Stop analysis
  stopAnalysis() {
    this.isAnalyzing = false;
  },
  
  // Analyze frame
  async analyzeFrame() {
    if (!this.isAnalyzing || !this.videoElement) return;
    
    // Calculate current frame number for sync
    if (this.isVideoMode && this.videoElement.duration) {
      this.currentFrame = Math.floor(this.videoElement.currentTime * 30); // Assuming 30fps
    }
    
    // Only process if Pose model is loaded and frame changed
    if (this.poseModelLoaded && this.pose && this.currentFrame !== this.lastProcessedFrame) {
      try {
        await this.pose.send({ image: this.videoElement });
        this.lastProcessedFrame = this.currentFrame;
      } catch (error) {
        console.error('Pose processing error:', error);
        // Continue playback even if pose fails
      }
    } else if (!this.poseModelLoaded) {
      // Just draw video without skeleton
      const ctx = this.canvasCtx;
      const canvas = this.canvasElement;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(this.videoElement, 0, 0, canvas.width, canvas.height);
    }
    
    requestAnimationFrame(() => this.analyzeFrame());
  },
  
  // Export current frame
  exportFrame() {
    const link = document.createElement('a');
    link.download = `nordic-walking-${this.currentView}-${Date.now()}.png`;
    link.href = this.canvasElement.toDataURL();
    link.click();
    
    this.updateStatus('ç«é¢å·²å¯åº');
  },
  
  // Export video (placeholder)
  exportVideo() {
    alert('å½±çå¯åºåè½éç¼ä¸­...');
  },
  
  // Toggle play/pause
  togglePlayPause() {
    if (!this.videoElement || !this.isVideoMode) return;
    
    if (this.isPlaying) {
      this.videoElement.pause();
      this.stopAnalysis();
      this.isPlaying = false;
      this.updateStatus('å·²æ«å');
    } else {
      this.videoElement.play();
      this.startAnalysis();
      this.isPlaying = true;
      this.updateStatus('åæä¸­...');
    }
    
    this.updatePlayPauseButton();
  },
  
  // Update play/pause button
  updatePlayPauseButton() {
    const btn = document.getElementById('playPauseBtn');
    if (btn) {
      btn.textContent = this.isPlaying ? 'â¸ æ«å' : 'â¶ï¸ æ­æ¾';
    }
  },
  
  // Set playback speed
  setSpeed(speed) {
    this.currentSpeed = speed;
    if (this.videoElement) {
      this.videoElement.playbackRate = speed;
    }
    
    // Update UI
    document.querySelectorAll('.btn-speed').forEach(btn => {
      btn.classList.remove('active');
    });
    document.querySelector(`[data-speed="${speed}"]`).classList.add('active');
    
    this.updateStatus(`æ­æ¾éåº¦: ${speed}x`);
  },
  
  // Previous frame
  async previousFrame() {
    if (!this.videoElement || !this.isVideoMode) return;
    
    if (this.isPlaying) {
      this.togglePlayPause();
    }
    
    this.videoElement.currentTime = Math.max(0, this.videoElement.currentTime - 1/30);
    this.updateTimeDisplay();
    
    // Force immediate frame processing
    await this.pose.send({ image: this.videoElement });
  },
  
  // Next frame
  async nextFrame() {
    if (!this.videoElement || !this.isVideoMode) return;
    
    if (this.isPlaying) {
      this.togglePlayPause();
    }
    
    this.videoElement.currentTime = Math.min(this.videoElement.duration, this.videoElement.currentTime + 1/30);
    this.updateTimeDisplay();
    
    // Force immediate frame processing
    await this.pose.send({ image: this.videoElement });
  },
  
  // Update time display
  updateTimeDisplay() {
    if (!this.videoElement || !this.isVideoMode) return;
    
    const current = this.videoElement.currentTime;
    const total = this.videoElement.duration || 0;
    
    const formatTime = (seconds) => {
      const mins = Math.floor(seconds / 60);
      const secs = Math.floor(seconds % 60);
      return `${mins}:${secs.toString().padStart(2, '0')}`;
    };
    
    let displayText = `${formatTime(current)} / ${formatTime(total)}`;
    
    // Show frame number when paused
    if (!this.isPlaying && total > 0) {
      const frameNumber = Math.floor(current * 30); // Assuming 30fps
      displayText += ` (å¹ ${frameNumber})`;
    }
    
    // Update both time displays
    const timeDisplay = document.getElementById('timeDisplay');
    const timeDisplayTop = document.getElementById('timeDisplayTop');
    if (timeDisplay) timeDisplay.textContent = displayText;
    if (timeDisplayTop) timeDisplayTop.textContent = displayText;
  },
  
  // Export statistics as text file
  exportStatistics() {
    if (!this.currentPose || !this.currentPose.poseLandmarks) {
      alert('è«åé²è¡åä½åæ');
      return;
    }
    
    const config = this.viewConfigs[this.currentView];
    
    let report = `Nordic Walking çµ±è¨æ¸æ
`;
    report += `================================

`;
    report += `è¦è§: ${config.label}
`;
    report += `å¯åºæé: ${new Date().toLocaleString('zh-TW')}

`;
    
    report += `è§åº¦çµ±è¨ (åº¦):
`;
    report += `--------------------------------
`;
    
    config.angles.forEach(angleConfig => {
      const stats = this.angleStats[angleConfig.key];
      if (stats.values.length > 0) {
        report += `${angleConfig.label}:
`;
        report += `  å³æ: ${stats.current.toFixed(1)}Â°
`;
        report += `  æå¤§: ${stats.max.toFixed(1)}Â°
`;
        report += `  æå°: ${stats.min.toFixed(1)}Â°
`;
        report += `  å¹³å: ${stats.average.toFixed(1)}Â°
`;
        report += `  å»ºè­°ç¯å: ${angleConfig.range[0]}-${angleConfig.range[1]}Â°

`;
      }
    });
    
    // Add pole statistics for side views
    if ((this.currentView === 'left' || this.currentView === 'right') && this.poleStats) {
      const leftPole = this.poleStats.leftPoleAngle;
      const rightPole = this.poleStats.rightPoleAngle;
      
      if (leftPole && leftPole.values.length > 0) {
        report += `æå°è§åº¦çµ±è¨ (åº¦):
`;
        report += `--------------------------------
`;
        report += `å·¦æ:
`;
        report += `  å³æ: ${leftPole.current.toFixed(1)}Â°
`;
        report += `  æå¤§: ${leftPole.max.toFixed(1)}Â°
`;
        report += `  æå°: ${leftPole.min.toFixed(1)}Â°
`;
        report += `  å¹³å: ${leftPole.average.toFixed(1)}Â°

`;
      }
      
      if (rightPole && rightPole.values.length > 0) {
        report += `å³æ:
`;
        report += `  å³æ: ${rightPole.current.toFixed(1)}Â°
`;
        report += `  æå¤§: ${rightPole.max.toFixed(1)}Â°
`;
        report += `  æå°: ${rightPole.min.toFixed(1)}Â°
`;
        report += `  å¹³å: ${rightPole.average.toFixed(1)}Â°

`;
      }
    }
    
    // Add stride statistics for side views
    if ((this.currentView === 'left' || this.currentView === 'right') && this.strideStats.values.length > 0) {
      report += `æ­¥å¹çµ±è¨ (å¬å):
`;
      report += `--------------------------------
`;
      report += `  å³æ: ${this.strideStats.current.toFixed(1)} cm
`;
      report += `  æå¤§: ${this.strideStats.max.toFixed(1)} cm
`;
      report += `  æå°: ${this.strideStats.min.toFixed(1)} cm
`;
      report += `  å¹³å: ${this.strideStats.average.toFixed(1)} cm

`;
    }
    
    // Add grip detection statistics
    if (this.gripStats.left.forwardSwing.total > 0 || this.gripStats.right.forwardSwing.total > 0) {
      report += `èé¨æ¡æ³çæçµ±è¨:
`;
      report += `--------------------------------
`;
      
      const leftStats = this.gripStats.left;
      const rightStats = this.gripStats.right;
      
      report += `å·¦è:
`;
      if (leftStats.forwardSwing.total > 0) {
        report += `  åæºæ¡æ³ä¸è´æ§: ${leftStats.forwardSwing.consistency.toFixed(1)}%
`;
      }
      if (leftStats.backwardSwing.total > 0) {
        report += `  å¾æºé¬éä¸è´æ§: ${leftStats.backwardSwing.consistency.toFixed(1)}%
`;
      }
      
      report += `å³è:
`;
      if (rightStats.forwardSwing.total > 0) {
        report += `  åæºæ¡æ³ä¸è´æ§: ${rightStats.forwardSwing.consistency.toFixed(1)}%
`;
      }
      if (rightStats.backwardSwing.total > 0) {
        report += `  å¾æºé¬éä¸è´æ§: ${rightStats.backwardSwing.consistency.toFixed(1)}%
`;
      }
      
      if (this.gripStats.coordination.total > 0) {
        report += `
èé¨åèª¿æ§: ${this.gripStats.coordination.percentage.toFixed(1)}%
`;
        const coordStatus = this.gripStats.coordination.percentage >= 70 ? 'è¯å¥½åèª¿' : 'éæ¹é²åèª¿';
        report += `  è©ä¼°: ${coordStatus}
`;
      }
      
      report += `
`;
    }
    
    // Add CoM information
    if (this.comPosition) {
      report += `èº«é«è³ªå¿ä½ç½®:
`;
      report += `--------------------------------
`;
      report += `  X: ${(this.comPosition.x * 100).toFixed(1)}%
`;
      report += `  Y: ${(this.comPosition.y * 100).toFixed(1)}%

`;
    }
    
    report += `================================
`;
    report += `è³æé»æ¸: ${config.angles[0] ? this.angleStats[config.angles[0].key].values.length : 0}
`;
    
    // Download as text file
    const blob = new Blob([report], { type: 'text/plain;charset=utf-8' });
    const link = document.createElement('a');
    link.download = `nordic-walking-stats-${this.currentView}-${Date.now()}.txt`;
    link.href = URL.createObjectURL(blob);
    link.click();
    
    this.updateStatus('çµ±è¨æ¸æå·²å¯åº');
  },
  
  // Export analysis report
  exportReport() {
    if (!this.currentPose || !this.currentPose.poseLandmarks) {
      alert('è«åé²è¡åä½åæ');
      return;
    }
    
    const angles = this.calculateAngles(this.currentPose.poseLandmarks);
    const config = this.viewConfigs[this.currentView];
    
    let report = `Nordic Walking åä½åæå ±å
`;
    report += `================================

`;
    report += `è¦è§: ${config.label}
`;
    report += `åææé: ${new Date().toLocaleString('zh-TW')}

`;
    report += `è§åº¦æ¸æ:
`;
    report += `--------------------------------
`;
    
    config.angles.forEach(angleConfig => {
      const value = angles[angleConfig.key];
      const status = value !== null ? this.getAngleStatus(value, angleConfig.range) : 'N/A';
      const statusText = status === 'good' ? 'â' : (status === 'warning' ? 'â ' : 'â');
      report += `${angleConfig.label}: ${value !== null ? value.toFixed(1) + 'Â°' : 'N/A'} ${statusText !== 'N/A' ? statusText : ''}
`;
      if (value !== null) {
        report += `  å»ºè­°ç¯å: ${angleConfig.range[0]}-${angleConfig.range[1]}Â°
`;
      }
    });
    
    report += `
================================
`;
    report += `å ±åçµæ
`;
    
    // Download as text file
    const blob = new Blob([report], { type: 'text/plain' });
    const link = document.createElement('a');
    link.download = `nordic-walking-report-${this.currentView}-${Date.now()}.txt`;
    link.href = URL.createObjectURL(blob);
    link.click();
    
    this.updateStatus('å ±åå·²å¯åº');
  },
  
  // Update status indicator
  updateStatus(message, isError = false) {
    // Update header status
    const headerStatus = document.getElementById('headerStatus');
    if (headerStatus) {
      headerStatus.textContent = message.length > 20 ? message.substring(0, 20) + '...' : message;
      headerStatus.style.color = isError ? 'var(--color-error)' : 'var(--color-text-secondary)';
    }
    
    // Update main status indicator (if exists)
    const indicator = document.getElementById('statusIndicator');
    if (indicator) {
      indicator.innerHTML = `
        <span class="status-dot"></span>
        <span>${message}</span>
      `;
      
      if (isError) {
        indicator.className = 'status-indicator error';
      } else {
        indicator.className = 'status-indicator';
      }
    }
  }
};

// Dynamically adjust canvas parent aspect-ratio to match source video/camera
app.updateCanvasContainerAspectRatio = function(videoWidth, videoHeight) {
  if (!this.ratioBox) return;
  // Calculate ratio string, avoiding NaN
  if (videoWidth && videoHeight) {
    this.ratioBox.style.aspectRatio = `${videoWidth} / ${videoHeight}`;
    // (Set min-width and min-height for extreme aspect ratios, if desired)
  } else {
    // Fallback to 16/9
    this.ratioBox.style.aspectRatio = '16 / 9';
  }
};

// Initialize app when DOM is loaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => app.init());
} else {
  app.init();
}

// Expose app globally for debugging
window.app = app;
      