/* Scene state machine and shared UI state helpers.
   Responsibility: store interaction state, render decisions, and expose shared scene helpers. */
const CHANNEL_NAME = 'hri_semantic_bridge';
const STORAGE_KEY = 'hri_state_snapshot';
const channel = ('BroadcastChannel' in window) ? new BroadcastChannel(CHANNEL_NAME) : null;

// Shared mutable scene state. These were inline in the original single-file prototype;
// after splitting into modules they must be declared once before other scene scripts use them.
let latestSnapshot = null;
let pendingClarification = null;
let selectedTemp = null;
let currentTarget = null;
let robotBusy = false;
let conversationLocked = false;
let lastProcessedSignature = '';
let latestSceneText = '';
let latestVoiceText = '';
let latestExpressionText = '等待检测页连接';
let latestPoseText = '等待检测页连接';
let latestAIText = '';
let interactionContextHistory = [];
let lastLLMContext = null;
let lastContextContinuation = null;
let voiceRec = null;
let sceneListening = false;


const $ = id => document.getElementById(id);
const roomCenters = { kitchen:{x:18,y:42}, dining:{x:49,y:29}, living:{x:49,y:62}, study:{x:82,y:29}, bathroom:{x:82,y:62}, cabinet:{x:50,y:73}, user:{x:86,y:84} };
const targetDropSpots = { kitchen:{x:74,y:63,location:'厨房台面'}, dining:{x:50,y:70,location:'餐桌附近'}, living:{x:70,y:62,location:'茶几附近'}, study:{x:70,y:72,location:'书桌附近'}, bathroom:{x:58,y:70,location:'洗漱台附近'}, cabinet:{x:72,y:58,location:'储物柜附近'}, user:{x:86,y:84,location:'用户手边'} };
const robotHomeSpot = { x:36, y:92 };
const userSpot = { x:90, y:92 };
const userObjectSpot = { x:86, y:84 };
const tempLabels = { hot:'热水', cold:'冷水', warm:'温水' };

function escapeHtml(value){ return String(value ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }

function shortText(value, max=96){
  const text = String(value ?? '').replace(/\s+/g,' ').trim();
  return text.length > max ? text.slice(0, max) + '…' : text;
}
function formatPercent(value, fallback='未给出'){
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.round(Math.max(0, Math.min(1, n)) * 100) + '%';
}
function normalizeConfidence(value, fallback=.72){
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  if (n > 1) return Math.max(0, Math.min(100, n)) / 100;
  return Math.max(0, Math.min(1, n));
}
function getGuidedSelectionContext(){
  const guided = window.__clarificationDockV11?.guided || null;
  const obj = guided?.objectId ? getObjectById(guided.objectId) : null;
  return {
    intent: guided?.intent || null,
    intentLabel: guided?.intent ? ({water:'接水喝', handover:'拿给我', move:'拿到地点', multi:'多段任务'}[guided.intent] || guided.intent) : null,
    objectId: guided?.objectId || null,
    objectName: obj?.name || null,
    targetRoom: guided?.room || null,
    targetRoomLabel: guided?.room ? roomLabel(guided.room) : null,
    temperature: guided?.temp || selectedTemp || null,
    temperatureLabel: (guided?.temp || selectedTemp) ? tempLabels[guided?.temp || selectedTemp] : null
  };
}
function detectInstructionAmbiguity(text){
  const clean = String(text || '').replace(/\s+/g,'').trim();
  const mentionedObjects = (typeof parseMentionedObjects === 'function') ? parseMentionedObjects(clean) : [];
  const mentionedRooms = (typeof parseMentionedRooms === 'function') ? parseMentionedRooms(clean) : [];
  const temp = (typeof parseTemp === 'function') ? parseTemp(clean) : null;
  const hasDeictic = /这个|那个|这一个|那一个|这里|那里|那边|这边|它|刚才那个|旁边那个/.test(clean);
  const wantsWater = /喝水|饮水|口渴|一杯水|倒水|接水|装水|灌水|盛水|打水|热水|冷水|温水/.test(clean) && !/不要接水|不用接水|不接水|只拿/.test(clean);
  const wantsMove = /拿到|放到|送到|移动到|移到|拿去|放回|拿回|归位|放回去/.test(clean);
  const wantsTake = /拿|取|递|给我|帮我拿|帮我取|送来|拿过来/.test(clean);
  const ambiguityTypes = [];
  if (!clean) ambiguityTypes.push('empty_input');
  if (hasDeictic) ambiguityTypes.push('deictic_reference');
  if (wantsWater && mentionedObjects.length === 0) ambiguityTypes.push('missing_cup_object');
  if (wantsWater && !temp) ambiguityTypes.push('missing_water_temperature');
  if ((wantsMove || wantsTake) && mentionedObjects.length === 0) ambiguityTypes.push('missing_target_object');
  if (wantsMove && mentionedRooms.length === 0 && !/给我|拿过来|拿来|送过来|我这里|用户位置/.test(clean)) ambiguityTypes.push('missing_destination');
  const clear = clean && ambiguityTypes.length === 0;
  return {
    clear: !!clear,
    clarity: clear ? 'clear' : 'ambiguous',
    ambiguityTypes,
    hasDeictic,
    wantsWater,
    wantsMove,
    wantsTake,
    mentionedObjects: mentionedObjects.map(o => ({ id:o.id, name:o.name, room:o.room, roomLabel:roomLabel(o.room), location:o.location, waterSuitable:o.waterSuitable, temp:o.temp })),
    mentionedRooms: mentionedRooms.map(r => ({ room:r, label:roomLabel(r) })),
    parsedTemperature: temp,
    parsedTemperatureLabel: temp ? tempLabels[temp] : null
  };
}
function getMapContextSummary(limit=12){
  const waterCups = semanticMap.objects.filter(o => o.waterSuitable).length;
  const unsafeCups = semanticMap.objects.filter(o => !o.waterSuitable).length;
  const byRoom = {};
  semanticMap.objects.forEach(o => {
    const key = roomLabel(o.room);
    if (!byRoom[key]) byRoom[key] = [];
    byRoom[key].push(o.name);
  });
  return {
    objectCount: semanticMap.objects.length,
    waterSuitableCount: waterCups,
    nonDrinkingObjectCount: unsafeCups,
    rooms: Object.entries(byRoom).map(([room, objects]) => ({ room, objects:objects.slice(0,8) })),
    salientObjects: semanticMap.objects.slice(0, limit).map(o => ({ name:o.name, room:roomLabel(o.room), location:o.location, category:o.category, waterSuitable:o.waterSuitable, temp:o.temp, note:o.note }))
  };
}
function buildInteractionContext(inputText='', options={}){
  const currentText = String(inputText || latestSceneText || latestVoiceText || (latestSnapshot?.speech?.valid ? latestSnapshot.speech.text : '') || '').trim();
  const ambiguity = detectInstructionAmbiguity(currentText);
  const guidedSelection = getGuidedSelectionContext();
  const pending = pendingClarification ? {
    type: pendingClarification.type || 'unknown',
    missing: pendingClarification.missing || null,
    candidateNames: (pendingClarification.candidates || []).slice(0,8).map(o => o.name),
    question: pendingClarification.aiQuestion || pendingClarification.clarificationQuestion || null,
    initialText: pendingClarification.initialText || null,
    intentHint: pendingClarification.intentHint || pendingClarification.smartPlan?.mode || pendingClarification.smartPlan?.action || null,
    contextUnderstanding: pendingClarification.contextUnderstanding || pendingClarification.smartPlan?.contextUnderstanding || pendingClarification.smartPlan?.reason || null,
    ambiguityTypes: pendingClarification.ambiguityTypes || pendingClarification.smartPlan?.ambiguityTypes || []
  } : null;
  const snapshotContext = {
    speech: latestVoiceText || latestSnapshot?.speech?.text || '',
    expression: latestExpressionText || '无有效表情状态',
    pose: latestPoseText || '无有效姿态状态',
    selectedTemperature: selectedTemp ? tempLabels[selectedTemp] : null
  };
  const context = {
    currentInput: currentText,
    currentTime: new Date().toLocaleString('zh-CN'),
    instructionClarity: ambiguity,
    guidedSelection,
    pendingClarification: pending,
    conversationContinuation: lastContextContinuation,
    multimodalContext: snapshotContext,
    mapSummary: getMapContextSummary(options.fullMap ? 30 : 10),
    recentTurns: interactionContextHistory.slice(-5)
  };
  lastLLMContext = context;
  return context;
}
function renderInteractionContext(inputText='', aiMeta=null, source=''){
  const box = document.getElementById('contextBox');
  const pill = document.getElementById('contextClarityPill');
  if (!box) return;
  const ctx = buildInteractionContext(inputText);
  const clarity = aiMeta?.clarity || ctx.instructionClarity.clarity;
  const isClear = aiMeta?.instructionClear ?? ctx.instructionClarity.clear;
  const className = isClear ? 'clear' : (ctx.instructionClarity.ambiguityTypes.length ? 'unclear' : 'warn');
  if (pill) pill.textContent = isClear ? '指令清晰：可拆解任务' : '指令不清晰：需要澄清';
  const ambiguityText = ctx.instructionClarity.ambiguityTypes.length ? ctx.instructionClarity.ambiguityTypes.join(' / ') : '暂无明显歧义';
  const objects = ctx.instructionClarity.mentionedObjects.length ? ctx.instructionClarity.mentionedObjects.map(o => `${o.name}（${o.roomLabel}）`).join('、') : '未明确对象';
  const rooms = ctx.instructionClarity.mentionedRooms.length ? ctx.instructionClarity.mentionedRooms.map(r => r.label).join('、') : '未明确地点';
  const selectionParts = [ctx.guidedSelection.intentLabel, ctx.guidedSelection.objectName, ctx.guidedSelection.targetRoomLabel, ctx.guidedSelection.temperatureLabel].filter(Boolean);
  const historyText = ctx.recentTurns.length ? ctx.recentTurns.map(t => `${t.input} → ${t.result}`).slice(-3).join('；') : '暂无历史任务';
  box.innerHTML = `
    <div class="context-chip ${className} full"><b>清晰度判断</b>${isClear ? '当前指令基本清晰。' : '当前指令存在歧义或缺少必要槽位。'}${aiMeta?.contextUnderstanding ? '｜' + escapeHtml(aiMeta.contextUnderstanding) : ''}</div>
    <div class="context-chip"><b>当前指令</b>${escapeHtml(shortText(ctx.currentInput || '未输入', 120))}</div>
    ${ctx.conversationContinuation?.used ? `<div class="context-chip full warn"><b>上下文续接</b>用户本轮回复“${escapeHtml(shortText(ctx.conversationContinuation.rawInput, 60))}”已被理解为上一轮澄清的回答，并合成为：“${escapeHtml(shortText(ctx.conversationContinuation.effectiveText, 140))}”。原因：${escapeHtml(ctx.conversationContinuation.reason || '')}</div>` : ''}
    <div class="context-chip"><b>歧义类型</b>${escapeHtml(ambiguityText)}</div>
    <div class="context-chip"><b>已识别对象</b>${escapeHtml(objects)}</div>
    <div class="context-chip"><b>已识别地点 / 水温</b>${escapeHtml(rooms)}${ctx.instructionClarity.parsedTemperatureLabel ? '｜' + escapeHtml(ctx.instructionClarity.parsedTemperatureLabel) : ''}</div>
    <div class="context-chip"><b>点击式选择</b>${escapeHtml(selectionParts.length ? selectionParts.join(' / ') : '用户未通过下方选项补充')}</div>
    <div class="context-chip"><b>多模态状态</b>${escapeHtml(shortText(`语音:${ctx.multimodalContext.speech || '无'}；姿态:${ctx.multimodalContext.pose}; 表情:${ctx.multimodalContext.expression}`, 120))}</div>
    <div class="context-chip full"><b>历史与地图摘要</b>${escapeHtml(historyText)}｜地图中共有 ${ctx.mapSummary.objectCount} 个对象，其中 ${ctx.mapSummary.waterSuitableCount} 个可饮水杯具，${ctx.mapSummary.nonDrinkingObjectCount} 个不建议饮水对象。</div>
    ${source ? `<div class="context-chip full"><b>推理来源</b>${escapeHtml(source)}</div>` : ''}
  `;
}
function pushInteractionHistory(input, result, plans=[]){
  if (!input) return;
  const taskSummary = (plans || []).map(p => `${p.object?.name || '未定对象'}:${p.action || 'clarify'}${p.confidence !== undefined ? '(' + formatPercent(p.confidence) + ')' : ''}`).join(' / ');
  interactionContextHistory.push({ time:new Date().toLocaleTimeString('zh-CN'), input:shortText(input, 80), result:shortText(result || taskSummary || '已处理', 120) });
  interactionContextHistory = interactionContextHistory.slice(-8);
}

function setBubble(text, options={}){
  if (!text) return false;
  if (conversationLocked && !options.force && !options.unlock) return false;
  $('bubble').textContent = text;
  if (options.lock) conversationLocked = true;
  if (options.unlock) conversationLocked = false;
  return true;
}

function setBubbleMode(mode){
  const bubble = $('bubble');
  if (!bubble) return;
  bubble.classList.remove('waiting','ai');
  if (mode) bubble.classList.add(mode);
}
function setProcessStep(step){
  document.querySelectorAll('#processStrip .process-step').forEach((el, idx) => el.classList.toggle('on', idx <= step));
}
function setStatusChipActive(id){
  document.querySelectorAll('.status-chip').forEach(el => el.classList.remove('active'));
  const node = $(id)?.closest?.('.status-chip');
  if (node) node.classList.add('active');
}
function readSceneApiKey(){
  const fromInput = ($('sceneApiKey')?.value || '').trim();
  return fromInput || localStorage.getItem('DEEPSEEK_KEY') || localStorage.getItem('deepseek_key') || '';
}
function saveSceneApiKey(){
  const key = ($('sceneApiKey')?.value || '').trim();
  if (!key) {
    localStorage.removeItem('DEEPSEEK_KEY');
    localStorage.removeItem('deepseek_key');
    if ($('aiStatus')) $('aiStatus').textContent = '已清除本页 DeepSeek Key，将使用本地规则推理。';
    setBubble('已清除本页 DeepSeek Key。现在点击“进行意图推理”会使用本地语义地图规则。', { force:true });
    return;
  }
  localStorage.setItem('DEEPSEEK_KEY', key);
  if ($('aiStatus')) $('aiStatus').textContent = 'DeepSeek API Key 已保存，本页推理将优先调用 DeepSeek。';
  setBubble('DeepSeek API Key 已保存。现在可以在本页输入“我想喝水”，然后点击“进行意图推理”。', { force:true });
}
function initializeApiKeyField(){
  const key = localStorage.getItem('DEEPSEEK_KEY') || localStorage.getItem('deepseek_key') || '';
  if (key && $('sceneApiKey')) $('sceneApiKey').value = key;
}
function humanAction(action){
  const map = { execute:'执行取杯与递送', clarify:'主动澄清', block:'语义拦截', block_and_clarify:'拦截并重新澄清', stop:'停止动作', observe_object:'观察到具体杯具', observe_room:'观察到指向区域', idle:'等待输入', infer:'意图推理', map_uploaded:'语义地图更新', clarify_temperature:'澄清水温', inspect_object:'查看杯具属性', waiting_clarification:'等待用户澄清', handover:'只取物并递送', clarify_take:'澄清拿取对象', move_object:'移动物品到指定位置', clarify_move:'澄清移动任务' };
  return map[action] || action || '决策';
}
function setDecision(obj={}){
  const rows = [];
  rows.push(`<div class="decision-item"><b>当前决策：</b>${escapeHtml(humanAction(obj.action))}</div>`);
  if (obj.reason) rows.push(`<div class="decision-item"><b>判断依据：</b>${escapeHtml(obj.reason)}</div>`);
  if (obj.target) rows.push(`<div class="decision-item"><b>目标对象：</b>${escapeHtml(typeof obj.target === 'string' ? obj.target : obj.target.name)}</div>`);
  if (obj.object) rows.push(`<div class="decision-item"><b>查看对象：</b>${escapeHtml(obj.object)}</div>`);
  if (obj.room) rows.push(`<div class="decision-item"><b>目标位置：</b>${escapeHtml(obj.room)}</div>`);
  if (obj.water_temperature) rows.push(`<div class="decision-item"><b>水温：</b>${escapeHtml(obj.water_temperature)}</div>`);
  if (obj.delivery) rows.push(`<div class="decision-item"><b>递送位置：</b>${escapeHtml(obj.delivery)}</div>`);
  if (obj.destination) rows.push(`<div class="decision-item"><b>目标去向：</b>${escapeHtml(obj.destination)}</div>`);
  if (obj.missing) {
    const missing = [];
    if (obj.missing.object) missing.push('具体杯具');
    if (obj.missing.location) missing.push('杯具位置');
    if (obj.missing.temperature) missing.push('水温');
    if (obj.missing.destination) missing.push('目标位置');
    if (missing.length) rows.push(`<div class="decision-item"><b>仍需澄清：</b>${escapeHtml(missing.join('、'))}</div>`);
  }
  if (obj.candidate_count !== undefined) rows.push(`<div class="decision-item"><b>候选数量：</b>${escapeHtml(obj.candidate_count)} 个</div>`);
  if (obj.candidates_by_room) {
    const text = Object.entries(obj.candidates_by_room).map(([room,names]) => `${room}：${names.join('、')}`).join('；');
    rows.push(`<div class="decision-item"><b>候选分布：</b>${escapeHtml(text)}</div>`);
  }
  if (obj.clarificationQuestion) rows.push(`<div class="decision-item"><b>机器人澄清：</b>${escapeHtml(obj.clarificationQuestion)}</div>`);
  $('decisionBox').innerHTML = `<div class="info-title">决策解释</div><div class="decision-list">${rows.join('')}</div>`;
}
function setRobotMode(mode){
  const robot = $('robot');
  robot.className = 'robot ' + (mode || 'happy');
  const face = $('robotFace');
  const faces = { happy:'＾', confused:'？', stop:'×', thinking:'…', carrying:'＾', walking:'•' };
  face.textContent = faces[mode] || '＾';
}
function highlightRoom(room){ document.querySelectorAll('.room').forEach(el => el.classList.toggle('active', el.dataset.room === room)); }
function clearObjectState(){ document.querySelectorAll('.object').forEach(el => el.classList.remove('selected','candidate','blocked')); }
function roomEl(room){ return document.querySelector(`.room[data-room="${room}"]`); }
function getObjectById(id){ return semanticMap.objects.find(o => o.id === id); }
function roomLabel(room){ return semanticMap.rooms[room]?.label || room; }
