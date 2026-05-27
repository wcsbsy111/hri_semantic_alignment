/* Bridge + state pool for the detection page.
   Responsibility: maintain TTL-based multimodal state and publish snapshots to the scene page. */
let video = document.getElementById('video');
let canvas = document.getElementById('canvas');
let ctx = canvas.getContext('2d');
let infoEl = document.getElementById('info');
let poseNet;
let poses = [];

const voiceResult = document.getElementById('voiceResult');
const faceResult = document.getElementById('faceResult');
const statePoolResult = document.getElementById('statePoolResult');
const cameraDot = document.getElementById('cameraDot');
let finalVoiceText = "";
let currentExpressionText = "表情识别模型加载中";
let faceModelReady = false;

const STATE_TTL = { pose: 1500, expression: 3000, speech: 10000 };
const SAMPLE_INTERVAL = { pose: 300, expression: 700, stateRender: 500 };
const statePool = { pose: null, expression: null, speech: null };

const GAME_CHANNEL_NAME = 'hri_semantic_bridge';
const GAME_STORAGE_KEY = 'hri_state_snapshot';
const gameChannel = ('BroadcastChannel' in window) ? new BroadcastChannel(GAME_CHANNEL_NAME) : null;

function updateState(type, value, confidence = 1, ttl = STATE_TTL[type] || 3000) {
  statePool[type] = { value, confidence, timestamp: Date.now(), ttl };
  renderStatePool();
}
function getStateAge(item) { return Date.now() - item.timestamp; }
function isStateValid(type) { const item = statePool[type]; return !!item && getStateAge(item) <= item.ttl; }
function getValidState(type) { return isStateValid(type) ? statePool[type] : null; }
function clearExpiredStates() {
  Object.keys(statePool).forEach(type => {
    const item = statePool[type];
    if (item && getStateAge(item) > item.ttl) statePool[type] = null;
  });
}
function renderStatePool() {
  clearExpiredStates();
  const lines = [];
  lines.push(`【采样策略】Pose=${SAMPLE_INTERVAL.pose}ms / Face≈${SAMPLE_INTERVAL.expression}ms / 状态刷新=${SAMPLE_INTERVAL.stateRender}ms`);
  lines.push(`【有效期TTL】Pose=${STATE_TTL.pose}ms / Face=${STATE_TTL.expression}ms / Speech=${STATE_TTL.speech}ms`);
  lines.push('');
  const poseState = statePool.pose, expressionState = statePool.expression, speechState = statePool.speech;
  lines.push(poseState ? `Pose: ✅ ${poseState.value.token}｜${poseState.value.description}｜age=${getStateAge(poseState)}ms｜conf=${Math.round(poseState.confidence * 100)}%` : 'Pose: ❌ 无有效姿态状态');
  lines.push(expressionState ? `Face: ✅ ${expressionState.value.token}｜${expressionState.value.description}｜age=${getStateAge(expressionState)}ms｜conf=${Math.round(expressionState.confidence * 100)}%` : 'Face: ❌ 无有效表情状态');
  lines.push(speechState ? `Speech: ✅ ${speechState.value.token}｜${speechState.value.text}｜age=${getStateAge(speechState)}ms｜conf=${Math.round(speechState.confidence * 100)}%` : 'Speech: ❌ 无有效语音状态');
  statePoolResult.innerText = lines.join('\n');
}
function getSemanticSnapshotText() { return JSON.stringify(getBridgeSnapshotObject(), null, 2); }
function getBridgeSnapshotObject() {
  clearExpiredStates();
  const poseState = getValidState('pose');
  const expressionState = getValidState('expression');
  const speechState = getValidState('speech');
  return {
    source: 'detection_page', timestamp: Date.now(), isoTime: new Date().toISOString(),
    pose: poseState ? { valid: true, token: poseState.value.token, description: poseState.value.description, confidence: poseState.confidence, age_ms: getStateAge(poseState) } : { valid: false, reason: '姿态状态不存在或已超过TTL' },
    expression: expressionState ? { valid: true, token: expressionState.value.token, description: expressionState.value.description, confidence: expressionState.confidence, age_ms: getStateAge(expressionState) } : { valid: false, reason: '表情状态不存在或已超过TTL' },
    speech: speechState ? { valid: true, token: speechState.value.token, text: speechState.value.text, confidence: speechState.confidence, age_ms: getStateAge(speechState) } : { valid: false, reason: '语音状态不存在或已超过TTL' }
  };
}
function broadcastStateToGame() {
  const snapshot = getBridgeSnapshotObject();
  try {
    localStorage.setItem(GAME_STORAGE_KEY, JSON.stringify(snapshot));
    if (gameChannel) gameChannel.postMessage(snapshot);
    const poseLabel = snapshot.pose.valid ? snapshot.pose.token : 'NO_POSE';
    const speechLabel = snapshot.speech.valid ? snapshot.speech.token : 'NO_SPEECH';
    document.getElementById('bridgeStatus').innerText = `桥接状态：已广播 ${poseLabel} / ${speechLabel}`;
  } catch (e) {
    document.getElementById('bridgeStatus').innerText = '桥接状态：广播失败 ' + e.message;
  }
}
document.getElementById('openGameBtn').onclick = () => { broadcastStateToGame(); window.open('semantic_home_scene.html', '_blank'); };
setInterval(broadcastStateToGame, 500);
