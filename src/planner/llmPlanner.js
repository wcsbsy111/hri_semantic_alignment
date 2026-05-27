/* LLM planner compatibility layer.
   In the current static GitHub Pages version, LLM output is validated by the v9 rule validator before execution. */
/* v17-clean: 单任务兼容规划器
   只给 v9 多任务队列提供 buildSmartPlan，不再覆盖按钮事件、不再启动旧版执行流。 */
(function(){
  function norm(text){ return String(text || '').replace(/\s+/g,'').trim(); }
  function hasWaterIntent(text){
    const clean = norm(text);
    if (/不要接水|不用接水|不接水|只拿|单纯拿/.test(clean)) return false;
    return /喝水|口渴|一杯水|接水|装水|倒水|灌水|盛水|打水|热水|冷水|温水/.test(clean);
  }
  function hasMoveIntent(text){ return /拿到|放到|送到|移动到|移到|拿去|放回|拿回|归位|放回去/.test(norm(text)); }
  function hasTakeIntent(text){ return /拿|取|递|给我|送来|拿来|拿过来|帮我拿/.test(norm(text)); }
  function tempFromText(text){
    const clean = norm(text);
    if (/热水|开水|烫水/.test(clean)) return 'hot';
    if (/冷水|凉水|冰水/.test(clean)) return 'cold';
    if (/温水|常温/.test(clean)) return 'warm';
    return null;
  }
  function objectCandidates(text){
    const mentioned = (typeof parseMentionedObjects === 'function') ? parseMentionedObjects(norm(text)) : [];
    const rooms = (typeof parseMentionedRooms === 'function') ? parseMentionedRooms(norm(text)) : [];
    let list = mentioned.length ? mentioned : (hasWaterIntent(text) ? recommendWaterCups() : semanticMap.objects.slice());
    if (rooms.length) list = list.filter(o => rooms.includes(o.room));
    return Array.from(new Map(list.map(o => [o.id, o])).values());
  }
  function makeWaterPlan(obj, temp, dest, reason){
    const destination = dest || makeDestination('user', '接水后递送到用户');
    const finalTemp = temp || 'warm';
    return { action:'water_delivery', object:obj, destination, temperature:finalTemp, reason, steps:[
      `到${roomLabel(obj.room)}找到${obj.name}`,
      `拿起${obj.name}`,
      `前往厨房饮水机，接${tempLabels[finalTemp] || '水'}`,
      destination.room === 'user' ? '送到用户位置' : `送到${destinationLabel(destination)}`,
      `更新语义地图中${obj.name}的位置`
    ]};
  }
  function makeMovePlan(obj, dest, reason){
    const destination = dest || makeDestination('user', '默认递送到用户');
    return { action:destination.room === 'user' ? 'handover' : 'move_object', object:obj, destination, reason, steps:[
      `到${roomLabel(obj.room)}找到${obj.name}`,
      `拿起${obj.name}`,
      destination.room === 'user' ? '送到用户位置' : `移动到${destinationLabel(destination)}`,
      `放下${obj.name}`,
      `更新语义地图中${obj.name}的位置`
    ]};
  }
  function buildSmartPlan(text){
    const clean = norm(text);
    const temp = tempFromText(clean);
    const candidates = objectCandidates(clean);
    const obj = candidates.length === 1 ? candidates[0] : null;
    if (!clean) {
      return { action:'clarify', reason:'缺少用户输入', candidates:[], clarificationQuestion:'请先输入一句具体任务。' };
    }
    if (/停|停止|取消|算了|不要了|别动|不要动/.test(clean)) {
      return { action:'stop', reason:'用户要求停止当前动作', steps:['停止当前动作并清空待执行任务'] };
    }
    if (hasWaterIntent(clean)) {
      const waterCandidates = candidates.filter(o => o.waterSuitable);
      if (!obj) {
        return { action:'clarify', mode:'water', reason:'喝水/接水任务缺少唯一杯具。', candidates:waterCandidates.length ? waterCandidates : recommendWaterCups(), clarificationQuestion:'我理解你需要水，但还不能唯一确定杯具。你希望使用哪个杯子？要热水、冷水还是温水？' };
      }
      if (!obj.waterSuitable) {
        return { action:'clarify', mode:'water_blocked', reason:`${obj.name}不适合饮水。`, candidates:recommendWaterCups(), clarificationQuestion:`${obj.name}不适合用来喝水。你希望改用哪个日常饮水杯？` };
      }
      if (temp && obj.temp && !obj.temp.includes(temp)) {
        return { action:'clarify', mode:'temp_blocked', reason:`${obj.name}不适合${tempLabels[temp]}。`, candidates:recommendWaterCups().filter(o => !o.temp || o.temp.includes(temp)), clarificationQuestion:`${obj.name}不适合${tempLabels[temp]}。你想换杯子，还是换成其他水温？` };
      }
      return makeWaterPlan(obj, temp || selectedTemp || 'warm', makeDestination('user','默认递送到用户'), '单任务规划：取杯、接水并递送。');
    }
    if (hasMoveIntent(clean) || hasTakeIntent(clean)) {
      if (!obj) {
        return { action:'clarify', mode:'move', reason:'拿取/移动任务缺少唯一对象。', candidates:candidates.slice(0,12), clarificationQuestion:'你希望我操作哪一个物品？请说明具体杯具或直接点击地图对象。' };
      }
      const dest = parseDestination(clean, obj) || makeDestination('user','默认递送到用户');
      return makeMovePlan(obj, dest, '单任务规划：移动或递送物体。');
    }
    if (obj) {
      return { action:'clarify', mode:'object', reason:'识别到对象但缺少动作。', candidates:[obj], clarificationQuestion:`我识别到${obj.name}。你希望我拿给你、接水，还是移动到某个房间？` };
    }
    return { action:'clarify', mode:'unknown', reason:'当前输入无法形成安全、唯一任务。', candidates:semanticMap.objects.slice(0,8), clarificationQuestion:'请明确“操作哪个物体、做什么、放到哪里”。' };
  }
  window.__smartPlannerV8 = { buildSmartPlan };
})();
