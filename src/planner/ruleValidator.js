/* Multi-task validator and execution planner.
   Responsibility: validate LLM/local plans, resolve object bindings, split multi-step tasks, and prevent unsafe direct execution. */
/* =======================
   v9 Multi-task + Drag-aware Semantic Map
   Adds: multi-step task queues, non-overlapping placement, user-draggable objects.
======================= */
(function(){
  const V9 = 'v10-validated-multi-object-planner';
  const USER_SLOTS = [
    {x:70,y:82,location:'用户手边左侧'},
    {x:78,y:82,location:'用户手边中侧'},
    {x:86,y:82,location:'用户手边右侧'},
    {x:70,y:91,location:'用户手边左下'},
    {x:78,y:91,location:'用户手边中下'},
    {x:86,y:91,location:'用户手边右下'},
    {x:62,y:86,location:'用户附近备用区'}
  ];
  const ROOM_SLOT_OFFSETS = [
    {dx:0,dy:0},{dx:-13,dy:0},{dx:13,dy:0},{dx:0,dy:-12},{dx:0,dy:12},{dx:-13,dy:12},{dx:13,dy:12},{dx:-13,dy:-12},{dx:13,dy:-12}
  ];
  let dragState = null;

  function safe$(id){ return document.getElementById(id); }
  function sleep(ms){ return new Promise(resolve => setTimeout(resolve, ms)); }
  function clamp(v,min,max){ return Math.max(min, Math.min(max, v)); }
  function escapeHtml(text){ return String(text ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
  function textNorm(text){ return String(text || '').replace(/\s+/g,'').trim(); }
  function tempLabelV9(temp){ return ({hot:'热水',warm:'温水',cold:'冷水'}[temp] || '水'); }
  function actionLabelV9(action){ return {water_delivery:'取杯接水递送',handover:'取物递送',move_object:'空间移动',clarify:'主动澄清',stop:'停止'}[action] || action || '任务'; }
  function callMoveToObject(obj){ return new Promise(resolve => moveRobotToObject(obj, resolve)); }
  function callMoveToPosition(x,y){ return new Promise(resolve => moveRobotToPosition(x, y, resolve)); }
  function callMoveToDestination(dest){ return new Promise(resolve => moveRobotToDestination(dest, resolve)); }
  function callMoveHome(){ return new Promise(resolve => moveRobotHome(resolve)); }

  function distance(a,b){ return Math.hypot((a.x||0)-(b.x||0), (a.y||0)-(b.y||0)); }
  function occupiedSpots(room, objectId){
    return semanticMap.objects
      .filter(o => o.id !== objectId && o.room === room)
      .map(o => ({ x:Number(o.x || 50), y:Number(o.y || 50) }));
  }
  function spotFree(spot, used, threshold){
    return used.every(u => distance(spot,u) >= threshold);
  }
  function allocateDropSpot(room, objectId, preferred=null){
    if (room === 'user') {
      const used = occupiedSpots('user', objectId);
      const pref = preferred && preferred.room === 'user' ? {x:preferred.x, y:preferred.y, location:preferred.location || '用户手边'} : null;
      const candidates = [pref, ...USER_SLOTS].filter(Boolean).map(s => ({ x:s.x, y:s.y, location:s.location || '用户手边' }));
      return candidates.find(s => spotFree(s, used, 7.2)) || { x:clamp(68 + used.length * 5, 62, 88), y:clamp(82 + (used.length % 2) * 9, 80, 92), location:'用户手边备用位置' };
    }
    const base = preferred && preferred.room === room ? preferred : targetRoomDefault(room);
    const used = occupiedSpots(room, objectId);
    const candidates = ROOM_SLOT_OFFSETS.map(o => ({
      x:clamp((base.x ?? 50) + o.dx, 12, 88),
      y:clamp((base.y ?? 55) + o.dy, 18, 86),
      location:base.location || roomLabel(room)
    }));
    return candidates.find(s => spotFree(s, used, 13)) || { x:clamp((base.x ?? 50) + used.length * 7, 12, 88), y:clamp((base.y ?? 55) + (used.length % 3) * 7, 18, 86), location:base.location || roomLabel(room) };
  }
  function allocateDestination(dest, objectId){
    const room = dest?.room || 'user';
    const slot = allocateDropSpot(room, objectId, dest);
    return { room, label:roomLabel(room), x:slot.x, y:slot.y, location:slot.location, reason:dest?.reason || '自动避让叠放位置' };
  }

  function findMentionedObjectsV9(text){
    const clean = textNorm(text);
    const out = [];
    for (const obj of semanticMap.objects) {
      const aliases = [obj.name, ...(obj.aliases || [])].filter(a => a && !['杯子','水杯','杯具','杯','那个','这个'].includes(a));
      if (aliases.some(a => clean.includes(a))) out.push(obj);
      else if (/一次性/.test(clean) && /一次性/.test(obj.name + obj.category)) out.push(obj);
    }
    return [...new Map(out.map(o => [o.id,o])).values()];
  }
  function resolveObjectByNameV9(name, fallback=''){
    const nameText = textNorm(name || '');
    const fallbackText = textNorm(fallback || '');
    function scoreObject(obj, text){
      if (!text) return 0;
      const aliases = [obj.name, ...(obj.aliases || [])].filter(Boolean).map(textNorm);
      let score = 0;
      for (const a of aliases) {
        if (!a || ['杯子','水杯','杯具','杯','那个','这个'].includes(a)) continue;
        if (text === a) score = Math.max(score, 100 + a.length);
        else if (text.includes(a)) score = Math.max(score, 70 + a.length);
        else if (a.includes(text) && text.length >= 2) score = Math.max(score, 55 + text.length);
      }
      // domain-specific normalization: 用户常说“塑料水杯”，地图对象叫“塑料饮水杯”
      if (/塑料/.test(text) && /水杯|饮水杯|杯/.test(text) && /塑料/.test(obj.name + (obj.category || ''))) score = Math.max(score, 95);
      if (/保温/.test(text) && /杯/.test(text) && /保温/.test(obj.name)) score = Math.max(score, 95);
      if (/办公/.test(text) && /杯/.test(text) && /办公/.test(obj.name)) score = Math.max(score, 95);
      return score;
    }
    if (nameText) {
      const ranked = semanticMap.objects.map(o => ({o, s:scoreObject(o, nameText)})).filter(x => x.s > 0).sort((a,b)=>b.s-a.s);
      if (ranked.length) return ranked[0].o;
      // When model gives an objectName that cannot be matched, do NOT bind it to the first object in the full sentence.
      // Returning null is safer and will trigger local plan validation or clarification.
      return null;
    }
    const exact = findMentionedObjectsV9(fallbackText);
    if (exact.length === 1) return exact[0];
    return null;
  }
  function normalizeTempV9(value, fallbackText=''){
    const v = String(value || '') + String(fallbackText || '');
    if (/hot|热|开水|烫/.test(v)) return 'hot';
    if (/cold|冷|凉|冰/.test(v)) return 'cold';
    if (/warm|温|常温|出门|保温|接满|装满/.test(v)) return 'warm';
    return null;
  }
  function resolveDestinationV9(value, fallbackText='', obj=null){
    const text = textNorm(`${value || ''}${fallbackText || ''}`);
    const names = {
      user:['user','用户','给我','拿给我','递给我','送给我','我这里','我这边','手边','身边'],
      kitchen:['kitchen','厨房','饮水机','厨房台面','水吧'],
      dining:['dining','餐桌','餐厅','饭桌'],
      living:['living','客厅','茶几','沙发'],
      study:['study','书房','办公桌','书桌'],
      bathroom:['bathroom','卫生间','洗手间','洗漱台','浴室'],
      cabinet:['cabinet','柜子','储物柜','橱柜','杯柜']
    };
    for (const [room, hints] of Object.entries(names)) {
      if (hints.some(h => text.includes(h))) return makeDestination(room, '用户/模型指定目标位置');
    }
    if (/放回|拿回|归位|回原处|原来的地方/.test(text) && obj?.homeRoom) return makeDestination(obj.homeRoom, '用户要求归位');
    return null;
  }
  function isWaterLikeV9(text){
    const clean = textNorm(text);
    if (/不要接水|不用接水|不接水|只拿|单纯拿/.test(clean)) return false;
    return /喝水|接水|装水|倒水|灌水|盛水|打水|接满|装满|倒满|灌满|一杯水|出门/.test(clean);
  }
  function makeWaterPlanV9(obj, temp, dest, reason){
    const destination = dest || makeDestination('user', '接水后递送到用户');
    const finalTemp = temp || normalizeTempV9('', obj?.name || '') || 'warm';
    return { action:'water_delivery', object:obj, destination, temperature:finalTemp, reason:reason || '复合接水任务', steps:[
      `到${roomLabel(obj.room)}找到${obj.name}`,
      `拿起${obj.name}`,
      `前往厨房饮水机，接${tempLabelV9(finalTemp)}`,
      destination.room === 'user' ? '送到用户位置' : `送到${destinationLabel(destination)}`,
      `更新语义地图中${obj.name}的位置`
    ]};
  }
  function makeMovePlanV9(obj, dest, reason){
    const destination = dest || makeDestination('user', '默认递送到用户');
    return { action:destination.room === 'user' ? 'handover' : 'move_object', object:obj, destination, reason:reason || '移动/拿取任务', steps:[
      `到${roomLabel(obj.room)}找到${obj.name}`,
      `拿起${obj.name}`,
      destination.room === 'user' ? '送到用户位置' : `移动到${destinationLabel(destination)}`,
      `放下${obj.name}`,
      `更新语义地图中${obj.name}的位置`
    ]};
  }

  function splitTasksV9(text){
    const raw = String(text || '').trim();
    if (!raw) return [];
    let t = raw
      .replace(/[，,；;]\s*(并且|而且|另外|同时|以及|接着|再|然后)\s*/g, '|||')
      .replace(/\s+(并且|而且|另外|同时|以及|接着)\s*/g, '|||')
      .replace(/(并且|而且|另外|同时|以及|接着)(?=把|将|帮|请|拿|取|递|送|放|移动|[\u4e00-\u9fa5]{1,10}(也)?拿)/g, '|||');
    const parts = t.split('|||').map(s => s.trim()).filter(Boolean);
    return parts.length ? parts : [raw];
  }

  function isReturnHomeIntentV10(text){
    return /放回|拿回|归位|回原处|回到原位|原来的地方|放回去|拿回去/.test(textNorm(text));
  }
  // 就把后续所有 move_object 的目的地都强制改成对象 homeRoom。
  function isReturnHomeIntentV13(text){
    return /放回|拿回(?!.*到)|归位|回原处|回到原位|原来的地方|放回去|拿回去/.test(textNorm(text));
  }
  function objectSpecificReturnIntentV13(text, obj){
    if (!obj) return false;
    const aliases = [obj.name, ...(obj.aliases || [])].filter(Boolean);
    const segments = splitTasksV9(text || '');
    const seg = segments.find(s => aliases.some(a => textNorm(s).includes(textNorm(a))));
    return !!seg && isReturnHomeIntentV13(seg);
  }
  function isGenericMoveOrTakeV10(text){
    return /拿|取|递|送|给我|放|移动|搬|带|拿到|放到|放回|拿回|归位/.test(textNorm(text));
  }
  function targetDestinationForObjectV10(seg, obj){
    if (isReturnHomeIntentV10(seg) && obj?.homeRoom) {
      return makeDestination(obj.homeRoom, `${obj.name}的homeRoom是${roomLabel(obj.homeRoom)}，执行归位`);
    }
    return resolveDestinationV9('', seg, obj) || (/给我|拿来|送来|递给我|我这里|身边|手边/.test(seg) ? makeDestination('user','用户要求递送') : null);
  }
  function localPlansFromTextV9(text){
    const segments = splitTasksV9(text);
    const plans = [];
    for (const seg of segments) {
      const mentioned = findMentionedObjectsV9(seg);
      const returnHome = isReturnHomeIntentV10(seg);
      const hasMultiMarker = /都|和|及|以及|并且|一起|也|、|,|，/.test(seg);
      // Multi-object operation: “把玻璃杯和塑料水杯放回去 / 把A和B拿给我”
      if (mentioned.length > 1 && !isWaterLikeV9(seg) && (hasMultiMarker || returnHome)) {
        for (const obj of mentioned) {
          const dest = targetDestinationForObjectV10(seg, obj) || makeDestination('user', '多物体递送任务');
          plans.push(makeMovePlanV9(obj, dest, returnHome ? `${obj.name}归位到${roomLabel(obj.homeRoom)}` : `多物体任务：${obj.name}`));
        }
        continue;
      }
      let plan = window.__smartPlannerV8?.buildSmartPlan ? window.__smartPlannerV8.buildSmartPlan(seg) : null;
      if (!plan || plan.action === 'clarify') {
        const obj = mentioned[0];
        const dest = obj ? targetDestinationForObjectV10(seg, obj) : null;
        if (obj && isWaterLikeV9(seg)) plan = makeWaterPlanV9(obj, normalizeTempV9('', seg), dest || makeDestination('user','接水后递送'), '本地解析到接水复合任务');
        else if (obj && (dest || isGenericMoveOrTakeV10(seg))) plan = makeMovePlanV9(obj, dest || makeDestination('user','默认递送到用户'), returnHome ? `${obj.name}归位到${roomLabel(obj.homeRoom)}` : '本地解析到移动/递送任务');
      }
      if (plan) plans.push(plan);
    }
    return plans.filter(Boolean);
  }

  function extractJsonV9(text){
    const raw = String(text || '').trim();
    const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const body = fenced ? fenced[1] : raw;
    const startObj = body.indexOf('{'), startArr = body.indexOf('[');
    let start = -1, end = -1;
    if (startArr >= 0 && (startObj < 0 || startArr < startObj)) { start = startArr; end = body.lastIndexOf(']'); }
    else { start = startObj; end = body.lastIndexOf('}'); }
    if (start < 0 || end <= start) return null;
    try { return JSON.parse(body.slice(start, end + 1)); } catch(e) { return null; }
  }
  async function callDeepSeekMultiPlanV9(inputText){
    const key = readSceneApiKey?.();
    if (!key) return null;
    const objectBrief = semanticMap.objects.map(o => ({
      name:o.name,
      aliases:o.aliases,
      room:o.room,
      roomLabel:roomLabel(o.room),
      location:o.location,
      category:o.category,
      waterSuitable:o.waterSuitable,
      temp:o.temp,
      hygiene:o.hygiene,
      homeRoom:o.homeRoom,
      note:o.note
    }));
    const context = buildInteractionContext(inputText, { fullMap:true });
    const prompt = `你是家庭服务机器人的“上下文语义对齐与任务规划模块”。你不是直接执行动作的控制器，而是先判断用户指令是否清晰，再决定是澄清还是拆解任务。

【你的核心工作】
1. 根据上下文信息判断用户指令是否清晰。尤其检查：
   - 是否出现“这个、那个、这里、那里、那边、它”等模糊指代词；
   - 是否缺少必要信息。例如“我要喝水/我想喝水”通常不清晰，因为机器人不知道用户想用玻璃杯、塑料杯、保温杯还是其他杯具，也不知道用户想喝热水、冷水还是温水；
   - 是否有多个候选对象、多个可能地点、多个动作目标，或物品用途/卫生属性存在风险。
2. 如果指令不清晰，不要编造目标，不要直接执行；请输出 instructionClear=false，并给出一句自然、具体的澄清问题。
3. 如果指令清晰，请按照用户当前语义把需求拆成一个或多个可执行任务 tasks。每个任务都必须有 confidence，表示你有多大把握该任务确实是用户想让机器人做的事情。
4. confidence 使用 0 到 1 的数字：非常确定 0.90-0.99；基本确定 0.75-0.89；仍有轻微不确定 0.60-0.74；低于 0.60 应优先澄清。
5. 请充分利用交互上下文：用户当前输入、点击式澄清选择、历史澄清状态、多模态状态、语义地图对象、对象是否适合饮水、可用水温、homeRoom 归位信息。
6. 如果 pendingClarification 或 conversationContinuation 表明当前输入是在回答上一轮澄清问题，必须继承上一轮的任务意图，不要把本轮短回答当成全新的独立指令。例如：
   - 上轮用户说“帮我拿一下那个水杯”，机器人问“哪一个水杯？”，本轮用户回答“一次性纸杯”，应理解为 handover：拿一次性纸杯给用户，不要再问“你希望我拿给你、接水还是移动”。
   - 上轮用户说“我想喝水”，机器人问“用哪个杯子、什么水温？”，本轮只回答“一次性纸杯”时，只补全杯具，仍应继续澄清水温，除非上下文已明确水温。
   - 上轮用户说“把那个杯子拿到厨房”，机器人问“哪个杯子？”，本轮回答“漱口杯”，应理解为 move_object：把漱口杯拿到厨房。

【用户当前输入】
${inputText}

【交互上下文 JSON】
${JSON.stringify(context, null, 2)}

【语义地图对象 JSON】
${JSON.stringify(objectBrief, null, 2)}

【房间枚举】
user=用户位置；kitchen=厨房/饮水机；dining=餐桌/餐厅；living=客厅/茶几；study=书房；bathroom=卫生间/洗漱台；cabinet=储物柜。

【动作枚举】
- water_delivery：取指定杯具 → 到饮水机接水/装水 → 送到目标位置。
- handover：只拿取指定物品给用户，不接水。
- move_object：移动指定物品到目标房间，不接水。
- clarify：信息不足，需要澄清。

【重要规则】
1. “我想喝水/我要喝水/口渴了”默认不清晰，除非上下文已经明确杯具和水温；应询问杯具与水温。
2. 出现“这个、那个、它、那里、那边”等指代词，若上下文无法唯一绑定对象/地点，应澄清。
3. “接满水、装水、倒水、喝水、一杯水”通常是 water_delivery；“不要接水、只拿、空杯”是 handover。
4. “把漱口杯拿到厨房/拿回卫生间/归位”是 move_object；漱口杯不适合喝水，但可以移动或递送。
5. 一句话中有“并且、另外、同时、以及、也、再、然后”等连接多个目标时，需要拆成多个 tasks。
6. “放回去/归位/拿回原处”应使用对象的 homeRoom。
7. 塑料杯/一次性塑料杯不适合热水；漱口杯、高脚杯、啤酒杯不应作为日常饮水杯。
8. 如果任务清晰，tasks 里的 objectName 必须严格使用语义地图对象里的 name，不要创造新对象名。
9. 面对短回答时，优先判断它是否是 pendingClarification 的槽位补全。只有在没有 pendingClarification、且无法从历史上下文继承动作时，才把它视为新话题。

【严格输出 JSON，不要输出 Markdown，不要输出解释文字】
{
  "instructionClear": true/false,
  "clarity": "clear|ambiguous|unsafe|uncertain",
  "ambiguityTypes": ["deictic_reference|missing_cup_object|missing_temperature|missing_destination|multiple_candidates|unsafe_object|other"],
  "contextUnderstanding": "一句话说明你如何理解当前上下文",
  "clarificationQuestion": "如果不清晰，给出一句具体澄清问题；如果清晰，写空字符串",
  "tasks": [
    {
      "action": "water_delivery|handover|move_object|clarify",
      "objectName": "语义地图中的对象名称，澄清时可为空",
      "destinationRoom": "user|kitchen|dining|living|study|bathroom|cabinet或空",
      "temperature": "hot|warm|cold或空",
      "confidence": 0.0到1.0,
      "reason": "为什么认为这是用户想让机器人做的任务"
    }
  ]
}`;
    const resp = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method:'POST', headers:{'Content-Type':'application/json','Authorization':'Bearer '+key},
      body:JSON.stringify({model:'deepseek-chat', messages:[{role:'user',content:prompt}], temperature:0.02})
    });
    const data = await resp.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content) throw new Error(data?.error?.message || 'DeepSeek 没有返回内容');
    latestAIText = content;
    if (safe$('aiStatus')) safe$('aiStatus').textContent = 'DeepSeek 已完成清晰度判断与任务规划。';
    const parsed = extractJsonV9(content);
    if (!parsed) return null;
    parsed.__llmPrompt = prompt;
    parsed.__llmContext = context;
    renderInteractionContext(inputText, parsed, 'DeepSeek 清晰度判断 + 上下文任务规划');
    return Array.isArray(parsed) ? {instructionClear:true, clarity:'clear', tasks:parsed, __llmPrompt:prompt, __llmContext:context} : parsed;
  }
  function plansFromAITasksV9(ai, originalText){
    if (!ai) return [];
    const tasks = Array.isArray(ai?.tasks) ? ai.tasks : [];
    const plans = [];
    const instructionClear = ai.instructionClear !== false && !['ambiguous','unsafe','uncertain'].includes(String(ai.clarity || '').toLowerCase());
    if (!instructionClear || tasks.some(t => t?.action === 'clarify')) {
      const question = ai?.clarificationQuestion || tasks.find(t => t?.action === 'clarify')?.reason || '我还需要确认具体物品、目标位置或水温。';
      const candidates = candidateSetForClarification?.(originalText, ai?.ambiguityTypes?.includes('missing_cup_object') ? 'water' : 'move') || semanticMap.objects.slice(0,8);
      plans.push({
        action:'clarify',
        reason: ai?.contextUnderstanding || ai?.reason || 'LLM 判断当前指令不够清晰。',
        clarificationQuestion: question,
        candidates,
        confidence: normalizeConfidence(tasks.find(t => t?.confidence !== undefined)?.confidence, .55),
        ambiguityTypes: ai?.ambiguityTypes || [],
        contextUnderstanding: ai?.contextUnderstanding || ''
      });
      return plans;
    }
    for (const task of tasks) {
      if (!task) continue;
      const confidence = normalizeConfidence(task.confidence, .78);
      if (confidence < .6) {
        plans.push({ action:'clarify', reason:task.reason || '任务置信度过低，需要用户确认。', clarificationQuestion:ai?.clarificationQuestion || `我不太确定你是否想让我执行“${task.objectName || '该对象'}”相关任务，请再确认一下。`, candidates:semanticMap.objects.slice(0,8), confidence, ambiguityTypes:['low_confidence'] });
        continue;
      }
      const objName = task.objectName || task.object || task.target || '';
      const obj = resolveObjectByNameV9(objName, '');
      if (!obj) {
        plans.push({ action:'clarify', reason:`LLM 输出的对象“${objName || '空'}”无法绑定到当前语义地图。`, clarificationQuestion:'我没有在当前语义地图中找到这个对象。请确认你要操作哪一个杯具或物品。', candidates:semanticMap.objects.slice(0,8), confidence:.5, ambiguityTypes:['object_not_in_map'] });
        continue;
      }
      const rawDest = task.destinationRoom || task.destination || '';
      const taskDestText = [rawDest, task.reason || '', task.contextUnderstanding || ''].join(' ');
      const explicitDest = resolveDestinationV9(rawDest, '', obj);
      const reasonDest = resolveDestinationV9('', taskDestText, obj);
      const returnHomeForThisTask = isReturnHomeIntentV13(taskDestText) || (!explicitDest && !reasonDest && objectSpecificReturnIntentV13(originalText, obj));
      const dest = returnHomeForThisTask && obj.homeRoom
        ? makeDestination(obj.homeRoom, `${obj.name}的homeRoom是${roomLabel(obj.homeRoom)}，执行归位`)
        : (explicitDest || reasonDest || makeDestination(task.action === 'move_object' ? 'user' : 'user', '目标位置未明确，默认用户位置'));
      let plan;
      if (task.action === 'water_delivery' || task.needsWater) plan = makeWaterPlanV9(obj, normalizeTempV9(task.temperature, originalText) || 'warm', dest, task.reason || 'DeepSeek 上下文规划');
      else plan = makeMovePlanV9(obj, dest, task.reason || 'DeepSeek 上下文规划');
      plan.confidence = confidence;
      plan.contextUnderstanding = ai?.contextUnderstanding || '';
      plans.push(plan);
    }
    return plans;
  }
  function renderQueueV9(plans, taskIndex=-1, stepIndex=-1){
    const board = safe$('plannerBoard');
    if (!board) return;
    if (!plans || !plans.length) {
      board.innerHTML = `<div class="planner-title">任务计划｜多任务队列</div><div class="planner-empty">等待输入。支持多对象归位、多段任务和拖动更新语义地图。</div>`;
      return;
    }
    const html = plans.map((p,pi) => {
      const currentTask = pi === taskIndex;
      const doneTask = pi < taskIndex;
      const steps = p.steps || [];
      if (p.action === 'clarify') {
        return `<div class="queue-task ${currentTask?'now':''}"><div class="queue-head"><b>任务 ${pi+1}｜主动澄清${p.confidence !== undefined ? `<span class="confidence-badge">置信度 ${formatPercent(p.confidence)}</span>` : ''}</b><span>${escapeHtml(p.reason || '')}</span></div><div class="planner-empty">${escapeHtml(p.clarificationQuestion || '需要澄清。')}</div></div>`;
      }
      return `<div class="queue-task ${currentTask?'now':''} ${doneTask?'done':''}"><div class="queue-head"><b>任务 ${pi+1}｜${escapeHtml(actionLabelV9(p.action))}：${escapeHtml(p.object?.name || '')}${p.confidence !== undefined ? `<span class="confidence-badge">置信度 ${formatPercent(p.confidence)}</span>` : ''}</b><span>${escapeHtml(p.reason || '')}</span></div><div class="plan-steps">${steps.map((s,si)=>`<div class="plan-step ${doneTask || (currentTask && si < stepIndex) ? 'done':''} ${currentTask && si === stepIndex ? 'now':''}"><div class="idx">${si+1}</div><div><b>${escapeHtml(s)}</b><span>${doneTask || (currentTask && si < stepIndex) ? '已完成': currentTask && si===stepIndex ? '执行中':'等待执行'}</span></div></div>`).join('')}</div></div>`;
    }).join('');
    board.innerHTML = `<div class="planner-title">任务计划｜多任务队列（${plans.length}项）</div>${html}`;
  }

  function setDecisionQueueV9(plans, source){
    const rows = [`<div class="decision-item"><b>推理方式：</b>${escapeHtml(source)}</div>`, `<div class="decision-item"><b>任务数量：</b>${plans.length} 个</div>`];
    if (plans[0]?.contextUnderstanding) rows.push(`<div class="decision-item"><b>上下文理解：</b>${escapeHtml(plans[0].contextUnderstanding)}</div>`);
    plans.forEach((p,i) => rows.push(`<div class="decision-item"><b>任务 ${i+1}：</b>${escapeHtml(actionLabelV9(p.action))}｜${escapeHtml(p.object?.name || p.clarificationQuestion || '')}${p.destination ? ' → ' + escapeHtml(destinationLabel(p.destination)) : ''}${p.temperature ? '｜' + escapeHtml(tempLabelV9(p.temperature)) : ''}${p.confidence !== undefined ? '｜置信度 ' + escapeHtml(formatPercent(p.confidence)) : ''}</div>`));
    safe$('decisionBox').innerHTML = `<div class="info-title">决策解释</div><div class="decision-list">${rows.join('')}</div>`;
  }

  async function executeSinglePlanV9(plan, plans, taskIndex){
    if (plan.action === 'clarify') {
      pendingClarification = { type:'smart', candidates:plan.candidates || [], smartPlan:plan, initialText:latestSceneText || latestVoiceText || '' };
      markCandidates((plan.candidates || []).map(o => o.id));
      setRobotMode('confused'); setBubbleMode('ai'); setProcessStep(2);
      setBubble(plan.clarificationQuestion || '我需要你进一步澄清。', { force:true, lock:true });
      renderQueueV9(plans, taskIndex, -1);
      return false;
    }
    const obj = plan.object;
    if (!obj) return true;
    renderQueueV9(plans, taskIndex, 0);
    highlightRoom(obj.room === 'user' ? null : obj.room);
    selectObject(obj.id);
    setBubble(`任务${taskIndex+1}：我先去${roomLabel(obj.room)}找${obj.name}。`, { force:true, unlock:true });
    await callMoveToObject(obj);

    renderQueueV9(plans, taskIndex, 1);
    setRobotMode('carrying');
    safe$('robot').dataset.carry = obj.icon || '☐';
    markObjectInTransit(obj);
    setBubble(`任务${taskIndex+1}：已拿起${obj.name}。`, { force:true });
    await sleep(320);

    if (plan.action === 'water_delivery') {
      renderQueueV9(plans, taskIndex, 2);
      const dispenser = roomLocalToGlobal('kitchen', 28, 58);
      highlightRoom('kitchen');
      setBubble(`任务${taskIndex+1}：前往饮水机，接${tempLabelV9(plan.temperature)}。`, { force:true });
      await callMoveToPosition(dispenser.x, dispenser.y);
      setBubble(`正在为${obj.name}接${tempLabelV9(plan.temperature)}，已按“接满/装满”需求处理。`, { force:true });
      await sleep(780);
      renderQueueV9(plans, taskIndex, 3);
      const finalDest = allocateDestination(plan.destination || makeDestination('user'), obj.id);
      setBubble(`任务${taskIndex+1}：接水完成，送到${destinationLabel(finalDest)}。`, { force:true });
      await callMoveToDestination(finalDest);
      safe$('robot').dataset.carry = '';
      updateObjectLocation(obj, finalDest.room, { x:finalDest.x, y:finalDest.y, location: finalDest.room === 'user' ? `${finalDest.location}（已接${tempLabelV9(plan.temperature)}）` : `${finalDest.location}（已接${tempLabelV9(plan.temperature)}）` });
      renderQueueV9(plans, taskIndex, 4);
      setBubble(`任务${taskIndex+1}完成：${obj.name}已接好${tempLabelV9(plan.temperature)}并放到${destinationLabel(finalDest)}。`, { force:true });
      await sleep(520);
      return true;
    }

    renderQueueV9(plans, taskIndex, 2);
    const finalDest = allocateDestination(plan.destination || makeDestination('user'), obj.id);
    setBubble(`任务${taskIndex+1}：前往${destinationLabel(finalDest)}，并避开已有物品摆放。`, { force:true });
    await callMoveToDestination(finalDest);
    renderQueueV9(plans, taskIndex, 3);
    safe$('robot').dataset.carry = '';
    updateObjectLocation(obj, finalDest.room, { x:finalDest.x, y:finalDest.y, location:finalDest.location });
    setRobotMode('happy');
    setBubble(`任务${taskIndex+1}完成：${obj.name}已放到${destinationLabel(finalDest)}。`, { force:true });
    renderQueueV9(plans, taskIndex, 4);
    await sleep(520);
    return true;
  }

  async function executeQueueV9(plans, source='本地任务规划器'){
    if (!plans || !plans.length) {
      setBubble('我没有形成可执行计划。请明确“操作哪个物体、做什么、放到哪里”。', { force:true, lock:true });
      return;
    }
    robotBusy = true;
    pendingClarification = null;
    conversationLocked = false;
    setBubbleMode(''); setProcessStep(3);
    setDecisionQueueV9(plans, source);
    renderInteractionContext(latestSceneText || latestVoiceText || '', { instructionClear:!plans.some(p=>p.action==='clarify'), clarity:plans.some(p=>p.action==='clarify')?'ambiguous':'clear', contextUnderstanding:plans[0]?.contextUnderstanding || '' }, source);
    renderQueueV9(plans, 0, -1);
    setBubble(`我把你的需求拆成了 ${plans.length} 个任务，将按顺序执行。`, { force:true, unlock:true });
    await sleep(420);
    for (let i=0; i<plans.length; i++) {
      if (plans[i]?.action === 'clarify') {
        robotBusy = false;
        pendingClarification = {
          type:'context_clarify',
          candidates:plans[i].candidates || [],
          missing:{},
          clarificationQuestion:plans[i].clarificationQuestion,
          initialText: latestSceneText || latestVoiceText || '',
          smartPlan: plans[i],
          intentHint: inferContinuationIntentV14(latestSceneText || latestVoiceText || ''),
          contextUnderstanding: plans[i].contextUnderstanding || plans[i].reason || '',
          ambiguityTypes: plans[i].ambiguityTypes || []
        };
        markCandidates((plans[i].candidates || []).map(o => o.id));
        setRobotMode('confused');
        setBubbleMode('ai');
        renderQueueV9(plans, i, -1);
        pushInteractionHistory(latestSceneText || latestVoiceText || '', plans[i].clarificationQuestion || '需要澄清', plans);
        renderInteractionContext(latestSceneText || latestVoiceText || '', { instructionClear:false, clarity:'ambiguous', contextUnderstanding:plans[i].contextUnderstanding || plans[i].reason || '' }, source);
        setBubble(plans[i].clarificationQuestion || '我还需要你确认具体对象、位置或水温。', { force:true, lock:true });
        return;
      }
      const ok = await executeSinglePlanV9(plans[i], plans, i);
      if (!ok) { robotBusy = false; return; }
    }
    renderQueueV9(plans, plans.length, -1);
    pushInteractionHistory(latestSceneText || latestVoiceText || '', `完成 ${plans.length} 个任务`, plans);
    renderInteractionContext(latestSceneText || latestVoiceText || '', { instructionClear:true, clarity:'clear', contextUnderstanding:'任务已执行并同步更新语义地图。' }, source);
    setBubble(`全部 ${plans.length} 个任务已完成。物体的新位置已经写回语义地图；你也可以直接拖动杯子来模拟用户改变环境。`, { force:true, unlock:true });
    await sleep(650);
    await callMoveHome();
    setRobotMode('happy'); robotBusy = false; setProcessStep(0);
  }

  function objectIdSetV10(plans){
    return new Set((plans || []).map(p => p?.object?.id).filter(Boolean));
  }
  function inferContinuationIntentV14(text){
    const clean = textNorm(text || '');
    if (!clean) return 'unknown';
    if (isWaterLikeV9(clean) || /喝水|口渴|一杯水|接水|装水|倒水|热水|冷水|温水/.test(clean)) return 'water';
    if (/拿到|放到|送到|移动到|移到|拿去|放回|拿回|归位|放回去|送去|带到/.test(clean)) return 'move';
    if (/拿|取|递|给我|帮我拿|帮我取|送来|拿过来|拿来|带过来/.test(clean)) return 'handover';
    return 'unknown';
  }
  function hasExplicitTaskVerbV14(text){
    return /喝水|接水|装水|倒水|灌水|盛水|打水|拿|取|递|送|放|移动|移到|拿到|放到|送到|归位|停止|取消/.test(textNorm(text || ''));
  }
  function isLikelyClarificationAnswerV14(text){
    const clean = textNorm(text || '');
    if (!clean) return false;
    const mentioned = findMentionedObjectsV9(clean);
    const temp = normalizeTempV9('', clean);
    const dest = resolveDestinationV9('', clean, mentioned[0] || null);
    const shortAnswer = clean.length <= 18;
    return shortAnswer && !hasExplicitTaskVerbV14(clean) && (mentioned.length > 0 || !!temp || !!dest || /热的|冷的|温的|这里|那里|那边|这个|那个/.test(clean));
  }
  function continuationRoomPhraseV14(dest){
    if (!dest) return '';
    if (dest.room === 'user') return '拿给我';
    return `拿到${roomLabel(dest.room)}`;
  }
  function buildContinuationTextV14(rawInput, pending){
    const raw = String(rawInput || '').trim();
    const base = pending?.initialText || latestSceneText || latestVoiceText || '';
    const intent = pending?.intentHint || pending?.smartPlan?.mode || inferContinuationIntentV14(base);
    const mentioned = findMentionedObjectsV9(raw);
    const obj = mentioned[0] || (pending?.candidates || [])[0] || null;
    const temp = normalizeTempV9('', raw) || selectedTemp || null;
    const dest = resolveDestinationV9('', raw, obj) || pending?.smartPlan?.destination || null;
    const hasObject = !!obj;
    const hasTemp = !!temp;
    const hasDest = !!dest;
    if (intent === 'water') {
      if (hasObject && hasTemp) return `我想用${obj.name}接${tempLabelV9(temp)}拿给我`;
      if (hasObject) return `我想用${obj.name}喝水`;
      if (hasTemp && /杯|水杯|杯具/.test(base)) return `${base}，${tempLabelV9(temp)}`;
      return `${base}，${raw}`;
    }
    if (intent === 'move') {
      if (hasObject && hasDest) return `把${obj.name}${continuationRoomPhraseV14(dest)}`;
      if (hasObject) return `${base}，对象是${obj.name}`;
      if (hasDest) return `${base}，目标是${roomLabel(dest.room)}`;
      return `${base}，${raw}`;
    }
    if (intent === 'handover') {
      if (hasObject) return `帮我拿${obj.name}给我，不接水`;
      return `${base}，${raw}`;
    }
    if (hasObject && /拿|取|递|给我|送来|拿过来|水杯|杯子/.test(base)) return `帮我拿${obj.name}给我，不接水`;
    return `${base}，${raw}`;
  }
  function resolveContextContinuationV14(rawInput){
    const raw = String(rawInput || '').trim();
    const pending = pendingClarification;
    if (!pending || !raw) {
      return { used:false, rawInput:raw, effectiveText:raw, reason:'' };
    }
    const isAnswer = isLikelyClarificationAnswerV14(raw);
    if (!isAnswer) {
      return { used:false, rawInput:raw, effectiveText:raw, reason:'本轮输入包含新的动作意图，按新指令处理。' };
    }
    const effectiveText = buildContinuationTextV14(raw, pending);
    return {
      used:true,
      rawInput:raw,
      effectiveText,
      previousInput:pending.initialText || '',
      previousQuestion:pending.clarificationQuestion || pending.aiQuestion || pending.smartPlan?.clarificationQuestion || '',
      reason:'本轮输入像是在回答上一轮澄清问题，因此继承上一轮的任务意图，只补全缺失槽位。'
    };
  }

  function shouldTrustLocalPlansV10(inputText, aiPlans, localPlans){
    const mentioned = findMentionedObjectsV9(inputText);
    const mentionedIds = new Set(mentioned.map(o => o.id));
    if (mentionedIds.size <= 1 || !localPlans?.length) return false;
    const aiIds = objectIdSetV10(aiPlans);
    const localIds = objectIdSetV10(localPlans);
    // If AI lost an object, duplicated an object, or mismatched the explicit mentioned object set, use local symbolic binding.
    if (aiIds.size < mentionedIds.size) return true;
    for (const id of mentionedIds) if (!aiIds.has(id) && localIds.has(id)) return true;
    if (localIds.size > aiIds.size) return true;
    // trust the local symbolic parser. This prevents “reason says kitchen, execution goes bathroom”.
    for (const localPlan of localPlans || []) {
      if (!localPlan?.object?.id || !localPlan?.destination?.room) continue;
      const aiPlan = (aiPlans || []).find(p => p?.object?.id === localPlan.object.id);
      if (aiPlan?.destination?.room && aiPlan.destination.room !== localPlan.destination.room) return true;
    }
    return false;
  }

  async function runInferenceV9(){
    const btn = safe$('inferSceneBtn');
    const rawInputText = (safe$('typedInput')?.value || '').trim() || latestSceneText || latestVoiceText || (latestSnapshot?.speech?.valid ? latestSnapshot.speech.text : '');
    if (!rawInputText) { setBubble('当前没有可推理输入。请先输入或语音说出任务。', {force:true}); return; }
    const continuity = resolveContextContinuationV14(rawInputText);
    lastContextContinuation = continuity.used ? continuity : null;
    const inputText = continuity.effectiveText || rawInputText;
    latestSceneText = inputText;
    setProcessStep(1);
    setBubbleMode('waiting');
    renderInteractionContext(inputText, null, continuity.used ? '推理前上下文续接检查' : '推理前上下文检查');
    setBubble(continuity.used
      ? `我把“${rawInputText}”理解为上一轮澄清的回答，并续接为：“${inputText}”。现在继续做上下文语义对齐。`
      : '我正在进行上下文语义对齐：先判断指令是否清晰，再决定澄清或拆成带置信度的任务。', {force:true, unlock:true});
    if (btn) { btn.classList.add('loading'); btn.textContent = '多任务规划中'; }
    let source = continuity.used ? '上下文续接 + 本地上下文任务规划器' : '本地上下文任务规划器';
    let plans = [];
    try {
      const ai = await callDeepSeekMultiPlanV9(inputText);
      const aiPlans = plansFromAITasksV9(ai, inputText);
      if (aiPlans.length) { plans = aiPlans; source = continuity.used ? '上下文续接 + DeepSeek 清晰度判断 + 页面执行器' : 'DeepSeek 上下文清晰度判断 + 页面执行器'; }
    } catch(err) {
      latestAIText = `DeepSeek 调用失败，已使用本地多任务规划器：${err.message || err}`;
      if (safe$('aiStatus')) safe$('aiStatus').textContent = '已使用本地多任务规划器。';
    }
    const localPlans = localPlansFromTextV9(inputText);
    if (!plans.length) plans = localPlans;
    // If the model drops “塑料水杯” or binds the second task to “玻璃杯”, the symbolic local plan overrides it.
    if (localPlans.length > plans.length || shouldTrustLocalPlansV10(inputText, plans, localPlans)) {
      plans = localPlans;
      source = source.includes('DeepSeek') ? 'DeepSeek 上下文推理 + 本地对象绑定校验' : source;
    }
    renderQueueV9(plans);
    await executeQueueV9(plans, source);
    if (btn) { btn.classList.remove('loading'); btn.textContent = '进行意图推理'; }
  }

  function findDropRoomAt(clientX, clientY){
    const user = safe$('userSpot')?.getBoundingClientRect();
    if (user && clientX >= user.left - 80 && clientX <= user.right + 40 && clientY >= user.top - 30 && clientY <= user.bottom + 40) return 'user';
    for (const el of document.querySelectorAll('.room')) {
      const r = el.getBoundingClientRect();
      if (clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom) return el.dataset.room;
    }
    return null;
  }
  function globalPercentFromClient(clientX, clientY){
    const h = safe$('house').getBoundingClientRect();
    return { x:clamp((clientX - h.left) / h.width * 100, 4, 96), y:clamp((clientY - h.top) / h.height * 100, 4, 96) };
  }
  function roomLocalPercentFromClient(room, clientX, clientY){
    const r = roomEl(room)?.getBoundingClientRect();
    if (!r) return {x:50,y:50};
    return { x:clamp((clientX - r.left) / r.width * 100, 10, 90), y:clamp((clientY - r.top) / r.height * 100, 18, 86) };
  }
  function makeObjectGlobalForDrag(el, obj){
    const pos = objectGlobalPosition(obj);
    safe$('house').appendChild(el);
    el.style.left = pos.x + '%';
    el.style.top = pos.y + '%';
  }
  function attachDragHandlersV9(){
    document.querySelectorAll('.object').forEach(el => {
      if (el.dataset.v9DragReady) return;
      el.dataset.v9DragReady = '1';
      el.title = '可拖动：移动后语义地图会实时更新';
      el.addEventListener('click', (e) => {
        if (Date.now() < (window.__v9SuppressClickUntil || 0)) { e.preventDefault(); e.stopImmediatePropagation(); }
      }, true);
      el.addEventListener('pointerdown', (e) => {
        if (el.classList.contains('in-transit')) return;
        const obj = getObjectById(el.dataset.id);
        if (!obj) return;
        dragState = { el, obj, startX:e.clientX, startY:e.clientY, moved:false };
        makeObjectGlobalForDrag(el, obj);
        el.classList.add('dragging');
        el.setPointerCapture?.(e.pointerId);
        e.preventDefault();
      });
      el.addEventListener('pointermove', (e) => {
        if (!dragState || dragState.el !== el) return;
        const d = Math.hypot(e.clientX - dragState.startX, e.clientY - dragState.startY);
        if (d > 4) dragState.moved = true;
        const p = globalPercentFromClient(e.clientX, e.clientY);
        el.style.left = p.x + '%'; el.style.top = p.y + '%';
      });
      el.addEventListener('pointerup', (e) => {
        if (!dragState || dragState.el !== el) return;
        const { obj, moved } = dragState;
        el.classList.remove('dragging');
        dragState = null;
        if (!moved) return;
        window.__v9SuppressClickUntil = Date.now() + 350;
        const room = findDropRoomAt(e.clientX, e.clientY) || obj.room;
        if (room === 'user') {
          const p = globalPercentFromClient(e.clientX, e.clientY);
          updateObjectLocation(obj, 'user', { x:p.x, y:p.y, location:'用户手动移动到用户附近' });
        } else {
          const p = roomLocalPercentFromClient(room, e.clientX, e.clientY);
          updateObjectLocation(obj, room, { x:p.x, y:p.y, location:`用户手动移动到${roomLabel(room)}` });
        }
        latestAIText = '用户通过鼠标改变了语义地图，机器人已感知最新位置。';
        if (safe$('aiStatus')) safe$('aiStatus').textContent = '已感知用户手动移动物体。';
        setBubble(`我已感知到用户手动移动了${obj.name}：当前位置为${roomLabel(obj.room)}｜${obj.location}。后续任务会按照这个新位置规划路线。`, {force:true, unlock:true});
        setDecision({ action:'manual_map_update', target:obj.name, room:roomLabel(obj.room), reason:'用户拖动物体后，语义地图对象坐标已实时更新。' });
      });
    });
  }

  const originalRenderObjectsV9 = renderObjects;
  renderObjects = function(){
    originalRenderObjectsV9();
    attachDragHandlersV9();
  };

  function enhanceToolbarV9(){
    const legacy = safe$('demoMultiTaskV9');
    if (legacy) legacy.remove();
    const note = document.querySelector('.interaction-card .small-note');
    if (note && !note.dataset.v9) {
      note.dataset.v9 = '1';
      note.textContent = '支持多对象归位、多任务队列、接水/拿取/移动/归位；拖动物体后会同步更新语义地图。';
    }
  }

  window.runSceneInference = runInferenceV9;
  window.__semanticV10 = { splitTasksV9, localPlansFromTextV9, allocateDropSpot, runInferenceV9, shouldTrustLocalPlansV10, buildInteractionContext: () => buildInteractionContext(latestSceneText || latestVoiceText || ''), getLastLLMContext: () => lastLLMContext };
  window.__semanticV9 = window.__semanticV10;
  window.addEventListener('load', () => {
    const btn = safe$('inferSceneBtn');
    if (btn) btn.onclick = (e) => { e.preventDefault(); runInferenceV9(); };
    const chip = safe$('modePill');
    if (chip) chip.textContent = '模式：上下文清晰度判断 + 置信度任务规划 v16';
    renderObjects();
    renderQueueV9([], -1, -1);
    enhanceToolbarV9();
  });
})();
