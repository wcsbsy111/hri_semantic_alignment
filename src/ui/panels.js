/* Scene panels, voice input, demos, map upload, and initial page wiring. */
function initSceneVoiceRecognition(){
  const btn = $('voiceSceneBtn');
  if (!btn) return;
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    btn.textContent = '浏览器不支持语音识别';
    btn.disabled = true;
    return;
  }
  voiceRec = new SpeechRecognition();
  voiceRec.lang = 'zh-CN';
  voiceRec.continuous = true;
  voiceRec.interimResults = true;
  voiceRec.onresult = e => {
    let text = '';
    for (let i=e.resultIndex;i<e.results.length;i++) text += e.results[i][0].transcript;
    latestVoiceText = text.trim();
    if ($('voiceStatus')) $('voiceStatus').textContent = latestVoiceText || '正在聆听...';
    if ($('typedInput') && latestVoiceText) $('typedInput').value = latestVoiceText;
  };
  voiceRec.onend = () => {
    sceneListening = false;
    btn.textContent = '开始语音识别';
  };
  btn.addEventListener('click', () => {
    if (!voiceRec) return;
    if (!sceneListening) {
      latestVoiceText = '';
      voiceRec.start();
      sceneListening = true;
      btn.textContent = '停止语音识别';
      if ($('voiceStatus')) $('voiceStatus').textContent = '正在聆听...';
    } else {
      voiceRec.stop();
      sceneListening = false;
      btn.textContent = '开始语音识别';
    }
  });
}
function initSceneInputs(){
  $('sendTextBtn')?.addEventListener('click', submitSceneText);
  $('typedInput')?.addEventListener('keydown', e => { if (e.key === 'Enter') submitSceneText(); });
  initSceneVoiceRecognition();
  updateMultimodalPanel(null);
}

function makeDemoSnapshot(token, text, poseToken=null){
  return { source:'home_demo', timestamp:Date.now(), isoTime:new Date().toISOString(), pose:poseToken ? { valid:true, token:poseToken, description:'模拟姿态：'+poseToken, confidence:.9, age_ms:0 } : { valid:false, reason:'demo no pose' }, speech:{ valid:true, token, text, confidence:.96, age_ms:0 }, expression:{ valid:true, token:'NEUTRAL', description:'平静/中性', confidence:.86, age_ms:0 }, aiText:'' };
}
function resetForNewDemo(){ pendingClarification = null; conversationLocked = false; robotBusy = false; lastProcessedSignature = ''; clearObjectState(); highlightRoom(null); }
function demoAmbiguousWater(){ resetForNewDemo(); selectedTemp = null; updateTempChoices(); receiveSnapshot(makeDemoSnapshot('DRINK_WATER_REQUEST','我想喝水'), { force:true }); }
function demoDiningCold(){ resetForNewDemo(); selectedTemp = 'cold'; updateTempChoices(); receiveSnapshot(makeDemoSnapshot('DRINK_WATER_REQUEST','我想用餐桌上的玻璃杯喝冷水'), { force:true }); }
function demoMouthwashBlocked(){ resetForNewDemo(); selectedTemp = 'cold'; updateTempChoices(); receiveSnapshot(makeDemoSnapshot('DRINK_WATER_REQUEST','我想用洗漱台的漱口杯喝水'), { force:true }); }
function demoPaperCupOnly(){ resetForNewDemo(); selectedTemp = null; updateTempChoices(); receiveSnapshot(makeDemoSnapshot('TAKE_OBJECT_REQUEST','帮我拿一个一次性纸杯给我，不要接水'), { force:true }); }
function demoStop(){ receiveSnapshot(makeDemoSnapshot('STOP_OR_CANCEL_COMMAND','停一下，不要了'), { force:true }); }
function onObjectClick(id){
  const obj = getObjectById(id);
  if (!obj) return;
  if (pendingClarification) {
    if (pendingClarification.candidates?.some(o => o.id === id) || pendingClarification.type === 'blocked') {
      if (pendingClarification.type === 'move') {
        if (pendingClarification.destination) return executeMoveObject(obj, pendingClarification.destination);
        selectObject(id); highlightRoom(obj.room === 'user' ? null : obj.room); setRobotMode('confused');
        pendingClarification = { ...pendingClarification, candidates:[obj] };
        setBubble(`你选择了${obj.icon}${obj.name}。请继续说明目标位置，例如“拿到厨房”“拿回卫生间”或“拿给我”。`, { force:true, lock:true });
        return setDecision({ action:'clarify_move', target:obj.name, reason:'物品已明确，但目标位置仍不明确。', missing:{ destination:true } });
      }
      if (pendingClarification.type === 'handover') return executeHandover(obj);
      if (!selectedTemp && obj.waterSuitable) {
        selectObject(id); highlightRoom(obj.room); setRobotMode('confused');
        setBubble(`你选择了${obj.icon}${obj.name}。还需要确认水温：热水、冷水还是温水？`, { force:true, lock:true });
        setDecision({ action:'clarify_temperature', target:obj.name, reason:'杯具已明确，但水温仍不明确。', missing:{ temperature:true } });
        pendingClarification = { type:'temperature', candidates:[obj] };
        return;
      }
      return executePickup(obj, selectedTemp);
    }
  }
  highlightRoom(obj.room === 'user' ? null : obj.room); selectObject(id); setRobotMode('thinking');
  setBubble(`${obj.icon}${obj.name}当前位置：${roomLabel(obj.room)}｜${obj.location || ''}。你可以让我把它拿给你，也可以说“拿到厨房/拿回卫生间/放到餐桌”。`, { force:true, lock:true });
  pendingClarification = { type:'move', candidates:[obj], destination:null, missing:{ destination:true } };
  setDecision({ action:'inspect_object', object:obj.name, semantic_attributes:{ room:roomLabel(obj.room), category:obj.category, waterSuitable:obj.waterSuitable, temp:obj.temp, note:obj.note } });
}

$('mapUpload').addEventListener('change', async e => {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    if (Array.isArray(data)) semanticMap.objects = data;
    else if (Array.isArray(data.objects)) {
      semanticMap.objects = data.objects;
      if (data.rooms) semanticMap.rooms = { ...semanticMap.rooms, ...data.rooms };
    } else throw new Error('JSON 中没有 objects 数组');
    semanticMap.objects.forEach(o => { if (!o.homeRoom) o.homeRoom = o.room; if (!o.homeLocation) o.homeLocation = o.location; });
    renderObjects(); renderSemanticMap();
    conversationLocked = false; setBubble('语义地图已更新。现在机器人会按照你上传的家庭物体位置和属性进行澄清与执行。', { force:true, unlock:true });
    setDecision({ action:'map_uploaded', reason:`已载入 ${semanticMap.objects.length} 个家庭对象，后续推理会按照新地图执行。` });
  } catch(err) { setBubble('语义地图上传失败：' + err.message, { force:true }); }
});
function downloadDefaultMap(){
  const blob = new Blob([JSON.stringify(semanticMap, null, 2)], { type:'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'home_semantic_map_cups.json'; a.click();
  URL.revokeObjectURL(url);
}

renderObjects();
renderSemanticMap();
initializeApiKeyField();
$('robot').style.left = robotHomeSpot.x + '%';
$('robot').style.top = robotHomeSpot.y + '%';
setRobotMode('happy');
initSceneInputs();
