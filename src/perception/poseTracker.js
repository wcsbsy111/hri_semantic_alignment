/* Pose tracker.
   Responsibility: run PoseNet, draw the skeleton overlay, and publish pose tokens. */
function getPoseDataText() {
  if (!poses || poses.length === 0) return '未检测到人体姿态';
  const p = poses[0].pose;
  const keyParts = ['nose','leftShoulder','rightShoulder','leftElbow','rightElbow','leftWrist','rightWrist','leftHip','rightHip'];
  let text = '【人体骨骼关键点】\n';
  keyParts.forEach(part => {
    const kp = p.keypoints.find(k => k.part === part);
    if (kp && kp.score > 0.2) text += `${part}: (x=${kp.position.x.toFixed(1)}, y=${kp.position.y.toFixed(1)}), 置信度=${(kp.score*100).toFixed(0)}%\n`;
  });
  return text;
}
function getKeypoint(pose, part, minScore = 0.2) { const kp = pose.keypoints.find(k => k.part === part); return (!kp || kp.score < minScore) ? null : kp; }
function analyzePoseToken() {
  if (!poses || poses.length === 0) return { token:'USER_NOT_DETECTED', description:'未检测到人体姿态', confidence:0 };
  const p = poses[0].pose;
  const nose = getKeypoint(p,'nose');
  const leftShoulder = getKeypoint(p,'leftShoulder'), rightShoulder = getKeypoint(p,'rightShoulder');
  const leftWrist = getKeypoint(p,'leftWrist'), rightWrist = getKeypoint(p,'rightWrist');
  const leftElbow = getKeypoint(p,'leftElbow'), rightElbow = getKeypoint(p,'rightElbow');
  if (!leftShoulder || !rightShoulder || (!leftWrist && !rightWrist)) return { token:'POSE_UNCERTAIN', description:'关键点不足，姿态语义不确定', confidence:.35 };
  const shoulderCenterX = (leftShoulder.position.x + rightShoulder.position.x) / 2;
  const shoulderCenterY = (leftShoulder.position.y + rightShoulder.position.y) / 2;
  const shoulderWidth = Math.abs(leftShoulder.position.x - rightShoulder.position.x);
  const dynamicThreshold = Math.max(45, shoulderWidth * .65);
  const candidates = [];
  if (rightWrist) {
    if (rightWrist.position.y < rightShoulder.position.y - 25) candidates.push({ token:'RIGHT_HAND_RAISED', description:'右手抬起，高于右肩', confidence:rightWrist.score });
    if (rightWrist.position.x > shoulderCenterX + dynamicThreshold) candidates.push({ token:'POINT_RIGHT', description:'右手位于身体右侧，可能指向右侧区域', confidence:rightWrist.score });
    if (rightWrist.position.x < shoulderCenterX - dynamicThreshold) candidates.push({ token:'POINT_LEFT', description:'右手跨过身体中线，可能指向左侧区域', confidence:rightWrist.score });
    if (rightElbow && rightWrist.position.y > shoulderCenterY - 20 && Math.abs(rightWrist.position.x - shoulderCenterX) < shoulderWidth * .9) candidates.push({ token:'REACH_FORWARD', description:'右手向身体前方伸出，可能表示递交或接取', confidence:Math.min(rightWrist.score,rightElbow.score) });
  }
  if (leftWrist) {
    if (leftWrist.position.y < leftShoulder.position.y - 25) candidates.push({ token:'LEFT_HAND_RAISED', description:'左手抬起，高于左肩', confidence:leftWrist.score });
    if (leftWrist.position.x < shoulderCenterX - dynamicThreshold) candidates.push({ token:'POINT_LEFT', description:'左手位于身体左侧，可能指向左侧区域', confidence:leftWrist.score });
    if (leftWrist.position.x > shoulderCenterX + dynamicThreshold) candidates.push({ token:'POINT_RIGHT', description:'左手跨过身体中线，可能指向右侧区域', confidence:leftWrist.score });
  }
  if (leftWrist && rightWrist && Math.abs(leftWrist.position.x - rightWrist.position.x) > shoulderWidth * 2) candidates.push({ token:'BOTH_HANDS_OPEN', description:'双手张开，可能表示大范围指示或拒绝', confidence:Math.min(leftWrist.score,rightWrist.score) });
  if (candidates.length) return candidates.sort((a,b)=>b.confidence-a.confidence)[0];
  return { token:'POSE_STABLE', description:nose ? '检测到人体，当前未出现明显指向或抬手动作' : '检测到上半身姿态，动作较稳定', confidence:.65 };
}
function samplePoseSemanticState() { const result = analyzePoseToken(); updateState('pose', { token:result.token, description:result.description }, result.confidence, STATE_TTL.pose); }

function draw() {
  ctx.clearRect(0,0,640,480);
  if (video.readyState >= 2) ctx.drawImage(video,0,0,640,480);
  if (poses.length > 0) {
    const p = poses[0].pose;
    p.keypoints.forEach(k => { if (k.score > .2) { ctx.fillStyle = '#ffcf5a'; ctx.beginPath(); ctx.arc(k.position.x,k.position.y,6,0,Math.PI*2); ctx.fill(); ctx.strokeStyle='rgba(20,40,32,.9)'; ctx.lineWidth=2; ctx.stroke(); } });
    poses[0].skeleton.forEach(s => { ctx.strokeStyle = '#72f0a0'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(s[0].position.x,s[0].position.y); ctx.lineTo(s[1].position.x,s[1].position.y); ctx.stroke(); });
    infoEl.textContent = getPoseDataText();
  }
  requestAnimationFrame(draw);
}

function initPerceptionCamera() {
  return navigator.mediaDevices.getUserMedia({ video:true })
.then(stream => {
  video.srcObject = stream;
  cameraDot.classList.add('active'); cameraDot.innerText = '摄像头运行中';
  poseNet = ml5.poseNet(video, { detectionType:'single' }, () => console.log('PoseNet 模型加载完成'));
  poseNet.on('pose', res => poses = res);
  initFaceExpression(); draw();
  setInterval(samplePoseSemanticState, SAMPLE_INTERVAL.pose);
  setInterval(renderStatePool, SAMPLE_INTERVAL.stateRender);
}).catch(e => { cameraDot.innerText = '摄像头启动失败'; alert('摄像头错误：' + e.message); });
}
