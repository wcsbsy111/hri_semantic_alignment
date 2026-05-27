/* Rule-based task parser and snapshot receiver.
   Responsibility: parse natural language, validate object/room/temp slots, and convert snapshots into decisions. */
function parseTemp(text){
  if (/热水|开水|烫水/.test(text)) return 'hot';
  if (/温水|常温水/.test(text)) return 'warm';
  if (/冷水|冰水|凉水/.test(text)) return 'cold';
  return null;
}
function isFillWaterRequest(text){
  return /接满水|装满水|倒满水|灌满水|盛满水|接水|倒水|装水|灌水|盛水|打水|装一杯水|接一杯水/.test(text || '');
}
function inferDefaultTempForFill(text, obj){
  const explicit = parseTemp(text) || selectedTemp;
  if (explicit) return explicit;
  if (isFillWaterRequest(text)) {
    if (/出门|带走|外出|路上/.test(text || '') && obj?.id === 'thermos_01') return 'warm';
    if (obj?.temp?.includes('warm')) return 'warm';
    if (obj?.temp?.includes('cold')) return 'cold';
    if (obj?.temp?.includes('hot')) return 'hot';
  }
  return null;
}
function parseMentionedRooms(text){
  const rooms = [];
  Object.entries(semanticMap.rooms).forEach(([key, room]) => { if (room.aliases?.some(a => text.includes(a)) || text.includes(room.label)) rooms.push(key); });
  return rooms;
}
function parseMentionedObjects(text){
  return semanticMap.objects.filter(obj => obj.aliases?.some(a => text.includes(a)) || text.includes(obj.name));
}
function isNoWaterRequest(text){ return /不要接水|不用接水|不接水|不用倒水|不要倒水|不要装水|不用装水|空杯|只拿|仅拿/.test(text || ''); }
function isWaterIntent(text, token){
  const clean = text || '';
  if (isNoWaterRequest(clean) && !/喝水|口渴|一杯水|倒杯水|接杯水|拿杯水|接水|装水|倒水|灌水|盛水|接满水|装满水/.test(clean)) return false;
  return token === 'DRINK_WATER_REQUEST' || /喝水|饮水|口渴|一杯水|倒杯水|接杯水|拿杯水|饮水机|热水|冷水|温水|接水|装水|倒水|灌水|盛水|打水|接满水|装满水|倒满水|灌满水/.test(clean);
}
function isGenericTakeIntent(text, token){ return token === 'TAKE_OBJECT_REQUEST' || /拿|取|递|给我|帮我拿|帮我取|送来|送过来|带过来|拿个|拿一个|拿只/.test(text || ''); }
function isMoveIntent(text){ return /拿到|放到|送到|带到|移动到|移到|拿去|送去|带去|放进|放在|拿回|放回|归位|放回去/.test(text || ''); }
function candidateObjectsForTake(text){
  let candidates = semanticMap.objects.slice();
  const mentioned = parseMentionedObjects(text || '');
  const sourceRooms = parseSourceRooms(text || '');
  const rooms = sourceRooms.length ? sourceRooms : parseMentionedRooms(text || '').filter(r => r !== parseTargetRoom(text || ''));
  if (mentioned.length) candidates = mentioned;
  else if (rooms.length) candidates = candidates.filter(o => rooms.includes(o.room));
  return candidates;
}
function parseSourceRooms(text){
  const clean = text || '';
  const beforeMove = clean.split(/拿到|放到|送到|带到|移动到|移到|拿去|送去|带去|放进|放在|拿回|放回|归位/)[0] || clean;
  return parseMentionedRooms(beforeMove);
}
function parseTargetRoom(text){
  const clean = text || '';
  const verbs = ['拿到','放到','送到','带到','移动到','移到','拿去','送去','带去','放进','放在','拿回','放回'];
  for (const verb of verbs) {
    const idx = clean.lastIndexOf(verb);
    if (idx >= 0) {
      const tail = clean.slice(idx + verb.length);
      for (const [key, room] of Object.entries(semanticMap.rooms)) {
        if (key === 'user') continue;
        if (room.aliases?.some(a => tail.includes(a)) || tail.includes(room.label)) return key;
      }
    }
  }
  if (/归位|放回去/.test(clean)) {
    const obj = parseMentionedObjects(clean)[0];
    if (obj?.homeRoom) return obj.homeRoom;
    if (obj?.id === 'mouthwash_cup_01') return 'bathroom';
  }
  return null;
}
function parseDestination(text, obj=null){
  const targetRoom = parseTargetRoom(text || '');
  if (targetRoom) return makeDestination(targetRoom, '用户指定目标房间');
  if (/给我|递给我|拿给我|拿过来|送过来|带过来|到我这里|我这里|我这边|用户位置|手边/.test(text || '')) return makeDestination('user', '用户要求送到自己身边');
  if (/拿来|送来|带来/.test(text || '')) return makeDestination('user', '用户要求拿来');
  return null;
}
function getPointedRoom(poseToken){
  if (!poseToken) return null;
  if (poseToken.includes('POINT_RIGHT')) return 'study';
  if (poseToken.includes('POINT_LEFT')) return 'kitchen';
  if (poseToken.includes('REACH_FORWARD')) return 'dining';
  return null;
}
function reasonFromSnapshot(snapshot){
  if (!snapshot) return { action:'idle', reason:'尚未收到状态池快照' };
  const speech = snapshot.speech?.valid ? snapshot.speech : null;
  const pose = snapshot.pose?.valid ? snapshot.pose : null;
  const text = speech?.text || '';
  const token = speech?.token || '';
  if (/停|停止|取消|算了|不要了|别动|不要动/.test(text) || token === 'STOP_OR_CANCEL_COMMAND') return { action:'stop', reason:'语音包含停止或取消意图' };
  const temp = parseTemp(text);
  if (temp) { selectedTemp = temp; updateTempChoices(); }
  const mentionedObjects = parseMentionedObjects(text);
  const mentionedRooms = parseMentionedRooms(text);
  const pointedRoom = getPointedRoom(pose?.token || '');
  if (isWaterIntent(text, token)) {
    if (mentionedObjects.length === 1) {
      const obj = mentionedObjects[0];
      if (!obj.waterSuitable) return { action:'block', target:obj, reason:`${obj.name}属于${obj.category}，不适合默认作为饮水杯。` };
      const resolvedTemp = inferDefaultTempForFill(text, obj);
      if (!resolvedTemp && !isFillWaterRequest(text)) return { action:'clarify', candidates:[obj], reason:`你已经明确了${obj.name}，但还没有说明水温。`, missing:{ temperature:true } };
      return { action:'execute', target:obj, temp:resolvedTemp, reason:isFillWaterRequest(text) ? '语音明确了杯具和接水/装水动作，可以按复合任务执行。' : '语音明确杯具，且水温已确认。' };
    }
    if (mentionedObjects.length > 1) return { action:'clarify', candidates:mentionedObjects, reason:'语音中出现多个杯具候选，无法唯一确定目标。', missing:{ object:true } };
    let candidates = recommendWaterCups();
    if (mentionedRooms.length > 0) candidates = candidates.filter(o => mentionedRooms.includes(o.room));
    else if (pointedRoom) candidates = candidates.filter(o => o.room === pointedRoom);
    if (selectedTemp || temp) candidates = candidates.filter(o => !o.temp || o.temp.includes(selectedTemp || temp));
    if (candidates.length === 1 && (selectedTemp || temp)) return { action:'execute', target:candidates[0], temp:selectedTemp || temp, reason:'位置/水温约束后只剩一个候选杯具。' };
    const reason = mentionedRooms.length ? `你提到了${mentionedRooms.map(roomLabel).join('、')}，但该位置仍有多个可用杯具。` : pointedRoom ? `我检测到你可能指向${roomLabel(pointedRoom)}，但该区域仍需确认具体杯具。` : '“我想喝水”没有说明杯子位置、杯具类型和水温。';
    return { action:'clarify', candidates, reason, missing:{ object:candidates.length!==1, location:mentionedRooms.length===0 && !pointedRoom, temperature:!(selectedTemp || temp) } };
  }
  if (isGenericTakeIntent(text, token) || isMoveIntent(text)) {
    const candidates = candidateObjectsForTake(text);
    const destination = parseDestination(text, candidates[0]);
    if (candidates.length === 1 && destination) return { action:'move_object', target:candidates[0], destination, reason:isUserDestination(destination) ? '用户要求将物品拿给自己。' : '用户指定了物品和目标位置，可以执行移动任务。' };
    if (candidates.length === 1 && !destination) return { action:'move_object', target:candidates[0], destination:makeDestination('user', '未指定目标位置，默认送到用户位置'), reason:'对象已明确，但没有指定目标位置，默认作为拿给用户的递送任务。' };
    if (candidates.length > 1) {
      const reason = destination ? `你指定了${destination.label}作为目标位置，但还没有唯一确定要移动哪个物品。` : '你提出了拿取/移动需求，但没有明确具体物品或目标位置。';
      return { action:'clarify_move', candidates, destination, reason, missing:{ object:candidates.length!==1, destination:!destination } };
    }
    return { action:'clarify_move', candidates:semanticMap.objects.slice(), destination, reason:'我没有在语义地图中确定你要移动的具体物品。', missing:{ object:true, destination:!destination } };
  }
  if (mentionedObjects.length === 1) return { action:'observe_object', target:mentionedObjects[0], reason:'语音提到了具体杯具，但没有明确任务动作。' };
  if (pointedRoom) return { action:'observe_room', room:pointedRoom, reason:'检测到指向动作，但没有明确语音任务。' };
  return { action:'idle', reason:'暂无可执行意图' };
}
function extractAIClarification(aiText){
  const text = (aiText || '').trim();
  if (!text) return '';
  const jsonMatch = text.match(/"clarificationQuestion"\s*:\s*"([^"]+)"/i) || text.match(/"澄清问题"\s*:\s*"([^"]+)"/);
  if (jsonMatch && jsonMatch[1] && !/无|不需要/.test(jsonMatch[1])) return jsonMatch[1].trim();
  const labelMatch = text.match(/【?澄清问题】?\s*[:：]\s*([^\n]+)/) || text.match(/clarification\s*question\s*[:：]\s*([^\n]+)/i);
  if (labelMatch && labelMatch[1] && !/无|不需要|none/i.test(labelMatch[1])) return labelMatch[1].trim();
  const sentence = text.split(/[\n。]/).find(line => /你希望|请选择|请确认|哪一个|哪只|热水|冷水|温水|哪里/.test(line));
  return sentence ? sentence.trim() : '';
}
function currentInputTextFromSnapshot(snapshot){
  return (snapshot?.speech?.valid ? snapshot.speech.text : '') || latestSceneText || latestVoiceText || '';
}
function snapshotSignature(snapshot){
  const speechText = snapshot?.speech?.valid ? snapshot.speech.text : '';
  const poseToken = snapshot?.pose?.valid ? snapshot.pose.token : '';
  const aiQuestion = extractAIClarification(snapshot?.aiText || '');
  return [speechText, poseToken, aiQuestion, selectedTemp || ''].join('|');
}
function isMeaningfulClarificationText(text){
  if (!text) return false;
  if (/停|停止|取消|算了|不要了|别动|不要动/.test(text)) return true;
  if (parseTemp(text)) return true;
  if (parseMentionedObjects(text).length > 0) return true;
  if (parseMentionedRooms(text).length > 0) return true;
  return false;
}
function updateMultimodalPanel(snapshot){
  const speech = snapshot?.speech?.valid ? snapshot.speech : null;
  const expression = snapshot?.expression?.valid ? snapshot.expression : null;
  const pose = snapshot?.pose?.valid ? snapshot.pose : null;
  if (speech?.text) latestVoiceText = speech.text;
  if (expression) latestExpressionText = `${expression.description || expression.token || '已识别'}${expression.confidence ? `｜置信度 ${Math.round(expression.confidence*100)}%` : ''}`;
  if (pose) latestPoseText = `${pose.description || pose.token || '已识别'}${pose.confidence ? `｜置信度 ${Math.round(pose.confidence*100)}%` : ''}`;
  if (snapshot?.aiText) latestAIText = snapshot.aiText;
  const voiceEl = $('voiceStatus'), expEl = $('expressionStatus'), poseEl = $('poseStatus'), aiEl = $('aiStatus');
  if (voiceEl) voiceEl.textContent = latestSceneText || latestVoiceText || '尚未输入语音或文字。';
  if (expEl) expEl.textContent = latestExpressionText || '等待检测页连接。';
  if (poseEl) poseEl.textContent = latestPoseText || '等待检测页连接。';
  if (aiEl) aiEl.textContent = latestAIText ? summarizeAIText(latestAIText) : '等待推理。';
}
function summarizeAIText(text){
  const q = extractAIClarification(text);
  if (q) return `需要澄清：${q}`;
  const intent = (text || '').match(/【?用户意图】?\s*[:：]\s*([^\n]+)/)?.[1];
  if (intent) return intent.trim();
  return (text || '').replace(/\s+/g,' ').slice(0,90) || '等待推理。';
}
function applyDecision(decision){
  if (!decision) return;
  if (robotBusy && decision.action !== 'stop') return;
  if (decision.action === 'stop') return stopAction(decision.reason);
  if (pendingClarification && decision.action === 'observe_object') {
    if (pendingClarification.type === 'move') {
      if (pendingClarification.destination) return executeMoveObject(decision.target, pendingClarification.destination);
      pendingClarification.candidates = [decision.target];
      setBubble(`你选择了${decision.target.icon}${decision.target.name}。请继续说明要放到哪里，例如“拿到厨房”或“拿回卫生间”。`, { force:true, lock:true });
      return setDecision({ action:'clarify_move', target:decision.target.name, reason:'物品已明确，但目标位置仍不明确。', missing:{ destination:true } });
    }
    if (pendingClarification.type === 'handover') return executeHandover(decision.target);
    if (!selectedTemp) {
      selectObject(decision.target.id); highlightRoom(decision.target.room); setRobotMode('confused');
      pendingClarification = { type:'temperature', candidates:[decision.target] };
      setBubble(`你选择了${decision.target.icon}${decision.target.name}。还需要确认水温：热水、冷水还是温水？`, { force:true, lock:true });
      return setDecision({ action:'clarify_temperature', target:decision.target.name, reason:'杯具已明确，但水温仍不明确。', missing:{ temperature:true } });
    }
    return executePickup(decision.target, selectedTemp);
  }
  if (decision.action === 'execute') return executePickup(decision.target, decision.temp);
  if (decision.action === 'handover') return executeHandover(decision.target);
  if (decision.action === 'move_object') return executeMoveObject(decision.target, decision.destination);
  if (decision.action === 'block') return blockObject(decision.target, decision.reason);
  if (decision.action === 'clarify') return askClarification(decision.candidates, decision.reason, decision.missing, decision.aiQuestion || decision.clarificationQuestion || '');
  if (decision.action === 'clarify_take') return askTakeClarification(decision.candidates, decision.reason, decision.aiQuestion || decision.clarificationQuestion || '');
  if (decision.action === 'clarify_move') return askMoveClarification(decision.candidates || [], decision.reason, decision.destination || null, decision.aiQuestion || decision.clarificationQuestion || '');
  if (decision.action === 'observe_object') {
    highlightRoom(decision.target.room); selectObject(decision.target.id); setRobotMode('thinking');
    setBubble(`我注意到你提到了${decision.target.icon}${decision.target.name}。请继续说明：你是想让我拿它、接水，还是移动它？`, { force:false });
    return setDecision(decision);
  }
  if (decision.action === 'observe_room') {
    highlightRoom(decision.room); clearObjectState(); setRobotMode('thinking');
    setBubble(`我注意到你可能指向${roomLabel(decision.room)}。请继续说出你想让我做什么。`, { force:false });
    return setDecision(decision);
  }
  if (pendingClarification) {
    return setDecision({ action:'waiting_clarification', reason:'当前澄清问题仍然有效，等待用户选择杯具、水温或目标位置。' });
  }
  setRobotMode('happy'); highlightRoom(null); clearObjectState();
  setBubble('我正在等待你的语音、手势或语义地图输入。', { force:false });
  setDecision(decision);
}
function receiveSnapshot(snapshot, options={}){
  latestSnapshot = snapshot;
  const age = Date.now() - (snapshot.timestamp || Date.now());
  $('connectionPill').textContent = snapshot.source === 'scene_text' || snapshot.source === 'scene_voice' ? '⌨️ 本页输入已接收' : `🔌 已连接检测页，延迟约 ${Math.max(0, age)}ms`;
  updateMultimodalPanel(snapshot);
  const text = currentInputTextFromSnapshot(snapshot);
  const sig = snapshotSignature(snapshot);
  const aiQuestion = extractAIClarification(snapshot.aiText || '');
  if (!options.force && sig === lastProcessedSignature) return;
  if (aiQuestion && !options.aiAlreadyHandled) {
    lastProcessedSignature = sig;
    const candidates = candidateObjectsForText(text);
    pendingClarification = { type:((isGenericTakeIntent(text, analyzeSceneSpeechToken(text)) || isMoveIntent(text)) && !isWaterIntent(text, '') ? 'move' : 'ai_clarification'), candidates, destination:parseDestination(text, candidates[0]), temp:selectedTemp, missing:{ object:true, destination:!parseDestination(text, candidates[0]), temperature:!selectedTemp }, aiQuestion, initialText:text };
    setRobotMode('confused');
    markCandidates(candidates.map(o => o.id));
    setBubbleMode('ai');
    setProcessStep(2);
    setBubble(`DeepSeek澄清：\n${aiQuestion}`, { force:true, lock:true });
    return setDecision({ action:'clarify', reason:'DeepSeek 推理结果显示当前指令仍存在语义歧义，需要用户澄清。', missing:{ object:true, destination:!parseDestination(text, candidates[0]), location:parseMentionedRooms(text).length===0, temperature:!selectedTemp }, candidate_count:candidates.length, candidates_by_room:groupCandidatesByRoom(candidates), clarificationQuestion:aiQuestion });
  }
  if (pendingClarification && !options.force && !isMeaningfulClarificationText(text) && !aiQuestion) {
    return setDecision({ action:'waiting_clarification', reason:'机器人已提出澄清问题，未收到新的杯具/位置/水温信息，因此保持气泡内容不变。' });
  }
  lastProcessedSignature = sig;
  if (pendingClarification && pendingClarification.type !== 'handover' && parseTemp(text) && pendingClarification.candidates?.length === 1) {
    selectedTemp = parseTemp(text); updateTempChoices();
    return executePickup(pendingClarification.candidates[0], selectedTemp);
  }
  const decision = reasonFromSnapshot(snapshot);
  if (aiQuestion && decision.action === 'clarify') decision.aiQuestion = aiQuestion;
  applyDecision(decision);
}
function pollStorage(){
  try { const raw = localStorage.getItem(STORAGE_KEY); if (!raw) return; const snapshot = JSON.parse(raw); if (!latestSnapshot || snapshot.timestamp !== latestSnapshot.timestamp) receiveSnapshot(snapshot); } catch(e) {}
}
if (channel) channel.onmessage = event => receiveSnapshot(event.data);
setInterval(pollStorage, 700);

function analyzeSceneSpeechToken(text){
  const clean = (text || '').trim();
  if (!clean) return 'NO_SPEECH';
  if (/停|停止|别动|不要动|取消|算了|不要了/.test(clean)) return 'STOP_OR_CANCEL_COMMAND';
  if (isWaterIntent(clean, '')) return 'DRINK_WATER_REQUEST';
  if (/拿|取|递|给我|帮我拿|帮我取/.test(clean)) return 'TAKE_OBJECT_REQUEST';
  return 'GENERAL_SPEECH';
}
function makeSceneInputSnapshot(text, source='scene_text', aiText=''){
  latestSceneText = (text || '').trim();
  return {
    source,
    timestamp:Date.now(),
    isoTime:new Date().toISOString(),
    pose: latestSnapshot?.pose || { valid:false, reason:'本页输入未提供姿态' },
    speech:{ valid:true, token:analyzeSceneSpeechToken(latestSceneText), text:latestSceneText, confidence:.98, age_ms:0 },
    expression: latestSnapshot?.expression || { valid:false, reason:'本页输入未提供表情' },
    aiText
  };
}
function submitSceneText(){
  const input = $('typedInput');
  const text = (input?.value || '').trim();
  if (!text) { setBubbleMode('waiting'); setBubble('请输入一句话，或者先点击“开始语音识别”。', { force:true }); return; }
  latestSceneText = text;
  setProcessStep(0);
  setStatusChipActive('voiceStatus');
  receiveSnapshot(makeSceneInputSnapshot(text, 'scene_text'), { force:true });
}

function candidateObjectsForText(text){
  const clean = text || '';
  if ((isGenericTakeIntent(clean, analyzeSceneSpeechToken(clean)) || isMoveIntent(clean)) && !isWaterIntent(clean, '')) {
    return candidateObjectsForTake(clean);
  }
  let candidates = recommendWaterCups();
  const rooms = parseMentionedRooms(clean);
  const temp = parseTemp(clean) || selectedTemp;
  if (rooms.length) candidates = candidates.filter(o => rooms.includes(o.room));
  if (temp) candidates = candidates.filter(o => !o.temp || o.temp.includes(temp));
  return candidates;
}
