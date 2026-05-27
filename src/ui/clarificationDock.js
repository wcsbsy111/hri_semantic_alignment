/* Click-to-compose clarification dock. */
/* =======================
   v11 Map-bottom clarification dock
   Moves clarification choices below the semantic map and adds click-to-compose interaction.
======================= */
(function(){
  const guided = { intent:null, objectId:null, room:'user', temp:null };
  const roomOrder = ['user','kitchen','dining','living','study','bathroom','cabinet'];
  const roomShort = { user:'用户位置', kitchen:'厨房', dining:'餐桌', living:'茶几', study:'书房', bathroom:'卫生间', cabinet:'储物柜' };
  const intentLabel = { water:'接水喝', handover:'拿给我', move:'拿到地点', multi:'多段任务' };
  function safe$(id){ return document.getElementById(id); }
  function textEscape(value){ return String(value ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
  function selectedObject(){ return guided.objectId ? getObjectById(guided.objectId) : null; }
  function roomName(room){ return roomShort[room] || roomLabel(room); }
  function setInputText(text){
    const input = safe$('typedInput');
    if (input) input.value = text;
    latestSceneText = text;
    const voice = safe$('voiceStatus');
    if (voice) voice.textContent = text || '尚未输入语音或文字。';
  }
  function buildGuidedText(){
    const obj = selectedObject();
    const objName = obj?.name || '杯子';
    const temp = guided.temp || selectedTemp;
    const tempText = temp ? tempLabels[temp] : '温水';
    const targetRoom = guided.room || 'user';
    if (guided.intent === 'multi') return '把玻璃杯接满热水之后拿给我，并且将咖啡杯也拿给我';
    if (guided.intent === 'water') return obj ? `用${objName}接${tempText}拿给我` : `我想喝水，${temp ? '想要' + tempText : '还没确定杯子和水温'}`;
    if (guided.intent === 'handover') return obj ? `把${objName}拿给我，不要接水` : '帮我拿一个杯子给我，不要接水';
    if (guided.intent === 'move') return obj ? `把${objName}拿到${roomName(targetRoom)}` : `把杯子拿到${roomName(targetRoom)}`;
    if (obj) return `我想操作${objName}`;
    return '';
  }
  function updateGuidedPreview(){
    const obj = selectedObject();
    const text = buildGuidedText();
    const pill = safe$('guidedStatePill');
    if (pill) {
      const parts = [];
      if (guided.intent) parts.push(intentLabel[guided.intent]);
      if (obj) parts.push(obj.name);
      if (guided.intent === 'move' && guided.room) parts.push(roomName(guided.room));
      if ((guided.intent === 'water' || selectedTemp) && (guided.temp || selectedTemp)) parts.push(tempLabels[guided.temp || selectedTemp]);
      pill.textContent = parts.length ? `当前选择：${parts.join(' / ')}` : '当前选择：等待点击';
    }
    const preview = safe$('guidedPreview');
    if (preview) {
      preview.innerHTML = text ? `已组合成任务：<b>${textEscape(text)}</b>` : '点击上方选项后，会在这里生成一句可执行任务，例如：<b>“用玻璃杯接温水拿给我”</b>。';
    }
    document.querySelectorAll('#intentChoices .choice').forEach(btn => btn.classList.toggle('active', btn.dataset.intent === guided.intent));
    document.querySelectorAll('#clarifyObjectChoices .choice').forEach(btn => btn.classList.toggle('active', btn.dataset.object === guided.objectId));
    document.querySelectorAll('#roomChoices .choice').forEach(btn => btn.classList.toggle('active', btn.dataset.room === guided.room));
    if (text) setInputText(text);
  }
  function renderGuidedObjects(){
    const box = safe$('clarifyObjectChoices');
    if (!box) return;
    const preferred = semanticMap.objects.slice().sort((a,b) => {
      const score = o => (o.waterSuitable ? 10 : 0) + (o.hygiene === 'personal' ? 3 : 0) + (o.category?.includes('日常饮水') ? 2 : 0);
      return score(b) - score(a);
    });
    box.innerHTML = preferred.map(obj => `<button class="choice object-choice" type="button" data-object="${textEscape(obj.id)}"><span>${obj.icon || '☐'}</span><span>${textEscape(obj.name)}<small>${textEscape(roomLabel(obj.room))}｜${textEscape(obj.location || '')}</small></span></button>`).join('');
    box.querySelectorAll('[data-object]').forEach(btn => btn.addEventListener('click', () => chooseGuidedObject(btn.dataset.object, { inspect:false })));
  }
  function renderGuidedRooms(){
    const box = safe$('roomChoices');
    if (!box) return;
    box.innerHTML = roomOrder.map(room => `<button class="choice room-choice" type="button" data-room="${room}">${room === 'user' ? '🤝' : '📍'} ${textEscape(roomName(room))}</button>`).join('');
    box.querySelectorAll('[data-room]').forEach(btn => btn.addEventListener('click', () => chooseGuidedRoom(btn.dataset.room, { fromButton:true })));
  }
  function chooseGuidedIntent(intent){
    guided.intent = intent;
    if (intent === 'water' && !guided.temp && !selectedTemp) { guided.temp = 'warm'; selectedTemp = 'warm'; updateTempChoices(); }
    if ((intent === 'handover' || intent === 'move') && !guided.room) guided.room = intent === 'handover' ? 'user' : 'kitchen';
    if (intent === 'multi') guided.room = 'user';
    updateGuidedPreview();
    setBubble(`已选择任务类型：${intentLabel[intent] || intent}。你可以继续点击杯子/地点，也可以直接点“执行当前选择”。`, { force:true, unlock:true });
  }
  function chooseGuidedObject(id, options={}){
    const obj = getObjectById(id);
    if (!obj) return;
    guided.objectId = id;
    if (!guided.intent) guided.intent = obj.waterSuitable ? 'water' : 'move';
    selectObject(id);
    if (obj.room !== 'user') highlightRoom(obj.room); else highlightRoom(null);
    updateGuidedPreview();
    if (options.inspect !== false) setBubble(`${obj.icon || ''}${obj.name}已被选中。你可以继续点任务类型或目标地点。`, { force:true, unlock:true });
  }
  function chooseGuidedRoom(room, options={}){
    guided.room = room;
    if (!guided.intent) guided.intent = 'move';
    highlightRoom(room === 'user' ? null : room);
    updateGuidedPreview();
    if (options.fromMap) setBubble(`已选择地点：${roomName(room)}。如果你已选择对象，可以直接执行当前选择。`, { force:true, unlock:true });
  }
  function resetGuidedChoice(){
    guided.intent = null; guided.objectId = null; guided.room = 'user'; guided.temp = null;
    selectedTemp = null; updateTempChoices();
    clearObjectState(); highlightRoom(null); updateGuidedPreview();
    setInputText('');
    setBubble('已清空澄清选择。你可以重新点击任务、杯子或地点。', { force:true, unlock:true });
  }
  async function runGuidedChoice(){
    const text = buildGuidedText();
    if (!text) { setBubble('请先选择任务类型、对象或地点，再执行当前选择。', { force:true }); return; }
    setInputText(text);
    renderInteractionContext(text, null, '点击式澄清结果');
    setBubble(`我将按这个澄清结果继续推理：${text}`, { force:true, unlock:true });
    if (typeof window.runSceneInference === 'function') await window.runSceneInference();
  }
  function runExample(text){
    if (!text) return;
    if (typeof resetForNewDemo === 'function') resetForNewDemo();
    // 之前会因为“塑料水杯”包含通用别名“水杯”，被旧解析器误绑定为玻璃杯，导致输入框被改写成“把玻璃杯拿到厨房”。
    guided.intent = null;
    guided.objectId = null;
    guided.room = 'user';
    guided.temp = null;
    selectedTemp = null;
    updateTempChoices();
    clearObjectState();
    highlightRoom(null);
    setInputText(text);
    const preview = safe$('guidedPreview');
    if (preview) preview.innerHTML = `已填入示例：<b>${textEscape(text)}</b>`;
    const pill = safe$('guidedStatePill');
    if (pill) pill.textContent = '当前选择：示例输入';
    renderInteractionContext(text, null, '示例按钮输入');
    if (typeof window.runSceneInference === 'function') window.runSceneInference();
  }
  function attachGuidedRoomClicks(){
    document.querySelectorAll('.room').forEach(el => {
      if (el.dataset.guidedClickReady) return;
      el.dataset.guidedClickReady = '1';
      el.classList.add('clickable-room');
      el.title = '点击选择这个地点作为任务目标';
      el.addEventListener('click', e => {
        if (e.target.closest('.object') || e.target.closest('button')) return;
        chooseGuidedRoom(el.dataset.room, { fromMap:true });
      });
    });
    const user = safe$('userSpot');
    if (user && !user.dataset.guidedClickReady) {
      user.dataset.guidedClickReady = '1';
      user.classList.add('clickable-room');
      user.title = '点击选择用户位置';
      user.addEventListener('click', e => { if (!e.target.closest('.object')) chooseGuidedRoom('user', { fromMap:true }); });
    }
  }
  function bindGuidedControls(){
    document.querySelectorAll('#intentChoices [data-intent]').forEach(btn => btn.addEventListener('click', () => chooseGuidedIntent(btn.dataset.intent)));
    document.querySelectorAll('#tempChoices [data-temp]').forEach(btn => btn.addEventListener('click', () => { guided.temp = btn.dataset.temp; updateGuidedPreview(); }));
    safe$('runGuidedChoiceBtn')?.addEventListener('click', runGuidedChoice);
    safe$('resetGuidedChoiceBtn')?.addEventListener('click', resetGuidedChoice);
    safe$('clarifyStopBtn')?.addEventListener('click', () => demoStop());
    document.querySelectorAll('#exampleTaskButtons [data-example]').forEach(btn => btn.addEventListener('click', () => runExample(btn.dataset.example)));
  }
  const previousRenderSemanticMap = renderSemanticMap;
  renderSemanticMap = function(){
    previousRenderSemanticMap();
    renderGuidedObjects();
    updateGuidedPreview();
  };
  const previousOnObjectClick = window.onObjectClick || onObjectClick;
  window.onObjectClick = function(id){
    chooseGuidedObject(id, { inspect:true });
    return previousOnObjectClick(id);
  };
  onObjectClick = window.onObjectClick;
  window.__clarificationDockV11 = { guided, runExample, runGuidedChoice, chooseGuidedIntent, chooseGuidedObject, chooseGuidedRoom };
  window.addEventListener('load', () => {
    renderGuidedRooms();
    renderGuidedObjects();
    bindGuidedControls();
    attachGuidedRoomClicks();
    updateGuidedPreview();
    renderInteractionContext('', null, '等待输入');
    const chip = safe$('modePill');
    if (chip) chip.textContent = '模式：上下文续接 + 点击式语义对齐 v16';
  });
})();
