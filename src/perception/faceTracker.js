/* Face expression tracker.
   Responsibility: load face-api models and write expression states into the shared state pool. */
function translateExpression(exp) {
  return { neutral:'平静/中性', happy:'高兴', sad:'悲伤', angry:'愤怒', fearful:'恐惧', disgusted:'厌恶', surprised:'惊讶' }[exp] || exp;
}
function getFaceExpressionText() { return `【用户表情识别结果】\n${currentExpressionText}`; }
async function initFaceExpression() {
  try {
    const MODEL_URL = 'https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@master/weights';
    faceResult.innerText = '⏳ 正在加载表情识别模型...';
    await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
    await faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL);
    faceModelReady = true;
    currentExpressionText = '模型已加载，等待检测人脸...';
    faceResult.innerText = currentExpressionText;
    detectFaceExpressionLoop();
  } catch (e) { currentExpressionText = '❌ 表情识别模型加载失败：' + e.message; faceResult.innerText = currentExpressionText; }
}
async function detectFaceExpressionLoop() {
  if (!faceModelReady) return;
  try {
    if (video.readyState >= 2) {
      const detection = await faceapi.detectSingleFace(video, new faceapi.TinyFaceDetectorOptions({ inputSize:224, scoreThreshold:.5 })).withFaceExpressions();
      if (detection && detection.expressions) {
        const best = Object.entries(detection.expressions).sort((a,b)=>b[1]-a[1])[0];
        const expressionName = translateExpression(best[0]);
        currentExpressionText = `当前表情：${expressionName}\n置信度：${(best[1]*100).toFixed(0)}%`;
        faceResult.innerText = currentExpressionText;
        updateState('expression', { token:best[0].toUpperCase(), description:expressionName }, best[1], STATE_TTL.expression);
      } else {
        currentExpressionText = '未检测到清晰人脸';
        faceResult.innerText = currentExpressionText;
        updateState('expression', { token:'FACE_NOT_DETECTED', description:'未检测到清晰人脸' }, 0, STATE_TTL.expression);
      }
    }
  } catch(e) { currentExpressionText = '表情识别运行中断：' + e.message; faceResult.innerText = currentExpressionText; }
  setTimeout(detectFaceExpressionLoop, SAMPLE_INTERVAL.expression);
}
