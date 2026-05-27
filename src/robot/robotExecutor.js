/* Robot motion and task execution.
   Responsibility: move the robot avatar, execute pickup/handover/water/move tasks, and handle stop/clarification actions. */
function moveRobotToPosition(targetX, targetY, callback){
  const robot = $('robot');
  const route = $('routeLine');
  const currentX = parseFloat(robot.style.left || robotHomeSpot.x);
  const currentY = parseFloat(robot.style.top || robotHomeSpot.y);
  const dx = targetX - currentX, dy = targetY - currentY;
  const len = Math.sqrt(dx*dx + dy*dy);
  const angle = Math.atan2(dy, dx) * 180 / Math.PI;
  route.style.left = currentX + '%'; route.style.top = currentY + '%'; route.style.width = len + '%'; route.style.transform = `rotate(${angle}deg)`; route.classList.add('active');
  setRobotMode('walking');
  robot.style.left = targetX + '%'; robot.style.top = targetY + '%';
  setTimeout(() => { route.classList.remove('active'); if (callback) callback(); }, 1120);
}
function roomLocalToGlobal(room, localX=50, localY=50){
  if (room === 'user') return { x:userSpot.x, y:userSpot.y };
  const house = $('house').getBoundingClientRect();
  const r = roomEl(room)?.getBoundingClientRect();
  if (!house || !r) return roomCenters[room] || { x:50, y:50 };
  const xPx = r.left - house.left + r.width * localX / 100;
  const yPx = r.top - house.top + r.height * localY / 100;
  return { x: xPx / house.width * 100, y: yPx / house.height * 100 };
}
function destinationGlobalPosition(destination){
  if (!destination) return robotHomeSpot;
  if (isUserDestination(destination)) return userSpot;
  return roomLocalToGlobal(destination.room, destination.x ?? 50, destination.y ?? 50);
}
function moveRobotToObject(obj, callback){
  const pos = objectGlobalPosition(obj);
  moveRobotToPosition(pos.x, pos.y, callback);
}
function moveRobotHome(callback){ moveRobotToPosition(robotHomeSpot.x, robotHomeSpot.y, callback); }
function moveRobotToUser(callback){ moveRobotToPosition(userSpot.x, userSpot.y, callback); }
function moveRobotToDestination(destination, callback){
  const pos = destinationGlobalPosition(destination);
  moveRobotToPosition(pos.x, pos.y, callback);
}
function targetRoomDefault(room){ return targetDropSpots[room] || { x:50, y:55, location: roomLabel(room) }; }
function markObjectInTransit(obj){
  const el = document.querySelector(`.object[data-id="${obj.id}"]`);
  if (el) el.classList.add('in-transit');
}
function updateObjectLocation(obj, room, options={}){
  const spot = targetRoomDefault(room);
  obj.room = room;
  obj.x = options.x ?? spot.x;
  obj.y = options.y ?? spot.y;
  obj.location = options.location || spot.location || roomLabel(room);
  renderObjects();
  renderSemanticMap();
  selectObject(obj.id);
  if (room && room !== 'user') highlightRoom(room); else highlightRoom(null);
}
function moveRobotToRoom(room, callback){
  const spot = room === 'user' ? userSpot : roomLocalToGlobal(room, 50, 55);
  moveRobotToPosition(spot.x, spot.y, callback);
}
function isUserDestination(dest){ return dest && dest.room === 'user'; }
function makeDestination(room, reason=''){
  const spot = targetRoomDefault(room);
  return { room, label: roomLabel(room), x: spot.x, y: spot.y, location: spot.location, reason };
}
function destinationLabel(dest){ return dest ? `${dest.label}${dest.location ? '｜' + dest.location : ''}` : '未确定'; }
function executePickup(obj, temp){
  if (!obj) return;
  if (!obj.waterSuitable) return blockObject(obj, '该杯具的语义属性不适合日常饮水。');
  if (temp && obj.temp && !obj.temp.includes(temp)) return blockObject(obj, `${obj.name}不适合${tempLabels[temp]}。`);
  conversationLocked = false;
  setBubbleMode('');
  setProcessStep(3);
  currentTarget = obj; pendingClarification = null; robotBusy = true;
  highlightRoom(obj.room); selectObject(obj.id);
  setBubble(`好的，我理解为：使用${roomLabel(obj.room)}的${obj.name}，从饮水机接${temp ? tempLabels[temp] : '水'}。我会按“取杯—接水—送到用户位置”的步骤执行。`, { force:true, unlock:true });
  setDecision({ action:'execute', target:obj.name, room:roomLabel(obj.room), water_temperature: temp ? tempLabels[temp] : '默认水温/未指定', delivery:'用户位置', reason:'杯具、位置与接水/递送步骤已经完成语义对齐，可以执行复合任务。' });
  moveRobotToObject(obj, () => {
    setRobotMode('carrying');
    $('robot').dataset.carry = obj.icon || '☕';
    markObjectInTransit(obj);
    setBubble(`我已经拿到${obj.name}，正在前往饮水机接${temp ? tempLabels[temp] : '水'}。`, { force:true });
    setTimeout(() => {
      moveRobotToPosition(18, 25, () => {
        setBubble(`已完成接水，我现在把${obj.name}送到用户位置。`, { force:true });
        setTimeout(() => {
          moveRobotToUser(() => {
            setRobotMode('happy');
            $('robot').dataset.carry = '';
            updateObjectLocation(obj, 'user', { x:userObjectSpot.x, y:userObjectSpot.y, location:`用户手边（已接${temp ? tempLabels[temp] : '水'}）` });
            setBubble(`${obj.name}已经接好${temp ? tempLabels[temp] : '水'}并送到用户位置。这个流程展示了机器人完成“澄清—取物—接水—递送”的完整交互。`, { force:true });
            setTimeout(() => moveRobotHome(() => { robotBusy = false; setRobotMode('happy'); }), 800);
          });
        }, 360);
      });
    }, 560);
  });
}
function executeHandover(obj){
  if (!obj) return;
  return executeMoveObject(obj, makeDestination('user', '用户要求拿给自己'));
}
function executeMoveObject(obj, destination){
  if (!obj || !destination) return;
  conversationLocked = false;
  setBubbleMode('');
  setProcessStep(3);
  selectedTemp = null;
  updateTempChoices();
  currentTarget = obj;
  pendingClarification = null;
  robotBusy = true;
  const sourceLabel = roomLabel(obj.room);
  highlightRoom(obj.room === 'user' ? null : obj.room);
  selectObject(obj.id);
  const taskLabel = isUserDestination(destination) ? '送到用户位置' : `移动到${destination.label}`;
  setBubble(`好的，我理解为：把${sourceLabel}的${obj.name}${taskLabel}。我会先去取物，再更新它在语义地图中的位置。`, { force:true, unlock:true });
  setDecision({ action:'move_object', target:obj.name, room:sourceLabel, destination:destinationLabel(destination), reason:isUserDestination(destination) ? '用户提出普通拿取/递送需求，不需要接水。' : '用户指定了物品和目标位置，因此执行家庭空间内的物体转移任务。' });
  moveRobotToObject(obj, () => {
    setRobotMode('carrying');
    $('robot').dataset.carry = obj.icon || '☐';
    markObjectInTransit(obj);
    setBubble(`我已经拿到${obj.name}，现在前往${destination.label}。`, { force:true });
    setTimeout(() => {
      const go = isUserDestination(destination) ? moveRobotToUser : (cb => moveRobotToDestination(destination, cb));
      go(() => {
        setRobotMode('happy');
        $('robot').dataset.carry = '';
        updateObjectLocation(obj, destination.room, { x:destination.x, y:destination.y, location:destination.location });
        setBubble(`${obj.name}已经放到${destinationLabel(destination)}。语义地图中的对象位置也已同步更新，你现在可以继续要求我把它拿回原处或移动到其他位置。`, { force:true });
        setTimeout(() => moveRobotHome(() => { robotBusy = false; setRobotMode('happy'); }), 800);
      });
    }, 420);
  });
}
function askMoveClarification(candidates, reason, destination=null, aiQuestion=''){
  pendingClarification = { type:'move', candidates, destination, missing:{ object:candidates.length!==1, destination:!destination }, initialText:latestSceneText || latestVoiceText || latestSnapshot?.speech?.text || '' };
  setRobotMode('confused');
  markCandidates(candidates.map(o => o.id));
  const names = candidates.slice(0,8).map(o => `${o.icon}${o.name}（${roomLabel(o.room)}）`).join('、');
  const question = aiQuestion || `${reason} 请说明“移动哪一个物品”以及“放到哪里”。你也可以点击高亮对象，例如：${names}${candidates.length>8?'等':''}。`;
  setBubble(question, { force:true, lock:true });
  setDecision({ action:'clarify_move', reason, missing:{ object:candidates.length!==1, destination:!destination }, candidate_count:candidates.length, candidates_by_room:groupCandidatesByRoom(candidates), clarificationQuestion:question, destination:destination ? destinationLabel(destination) : '' });
}
function askTakeClarification(candidates, reason, aiQuestion=''){
  pendingClarification = { type:'handover', candidates, missing:{ object:candidates.length!==1 }, initialText:latestSceneText || latestVoiceText || latestSnapshot?.speech?.text || '' };
  setRobotMode('confused');
  markCandidates(candidates.map(o => o.id));
  const grouped = groupCandidatesByRoom(candidates);
  const names = candidates.slice(0,8).map(o => `${o.icon}${o.name}（${roomLabel(o.room)}）`).join('、');
  const question = aiQuestion || `${reason} 你希望我拿哪一个？可以点击高亮对象，或直接说“拿一次性纸杯/拿餐桌上的玻璃杯”。候选包括：${names}${candidates.length>8?'等':''}`;
  setBubble(question, { force:true, lock:true });
  setDecision({ action:'clarify_take', reason, missing:{ object:true }, candidate_count:candidates.length, candidates_by_room:groupCandidatesByRoom(candidates), clarificationQuestion:question });
}
function blockObject(obj, reason){
  pendingClarification = { type:'blocked', candidates: recommendWaterCups(), temp:selectedTemp };
  highlightRoom(obj.room); markCandidates([], [obj.id]); setRobotMode('confused');
  const recommended = recommendWaterCups().slice(0,5).map(o => `${o.icon}${o.name}`).join('、');
  setBubble(`我不建议使用${obj.name}来喝水。原因：${reason} 可以改用：${recommended}。你希望用哪一个？`, { force:true, lock:true });
  setDecision({ action:'block_and_clarify', blocked:obj.name, reason, recommended:recommendWaterCups().slice(0,5).map(o=>o.name), clarificationQuestion:`我不建议使用${obj.name}，你希望改用哪一个杯子？` });
}
function askClarification(candidates, reason, missing={}, aiQuestion=''){
  pendingClarification = { type:'water', candidates, temp:selectedTemp, missing, initialText:latestSceneText || latestVoiceText || latestSnapshot?.speech?.text || '' };
  setRobotMode('confused');
  const ids = candidates.map(o => o.id);
  markCandidates(ids);
  const grouped = groupCandidatesByRoom(candidates);
  const names = candidates.slice(0,8).map(o => `${o.icon}${o.name}（${roomLabel(o.room)}）`).join('、');
  const tempText = selectedTemp ? `我已知道你要${tempLabels[selectedTemp]}。` : '还需要确认你要饮水机里的热水、冷水还是温水。';
  const defaultQuestion = `${reason} ${tempText} 你希望用哪里的杯子？可点击高亮杯具，或说“餐桌上的玻璃杯/书桌上的办公杯”。候选包括：${names}${candidates.length>8?'等':''}`;
  const question = aiQuestion || defaultQuestion;
  setBubble(question, { force:true, lock:true });
  setDecision({ action:'clarify', reason, missing, candidate_count:candidates.length, candidates_by_room:grouped, clarificationQuestion:question });
}
function groupCandidatesByRoom(candidates){
  const out = {};
  candidates.forEach(o => { const label = roomLabel(o.room); if (!out[label]) out[label] = []; out[label].push(o.name); });
  return out;
}
function recommendWaterCups(){
  return semanticMap.objects.filter(o => o.waterSuitable).sort((a,b) => preferenceScore(b) - preferenceScore(a));
}
function preferenceScore(o){
  let s = 0;
  if (o.hygiene === 'personal') s += 3;
  if (o.hygiene === 'family') s += 2;
  if (o.category?.includes('日常饮水')) s += 3;
  if (o.room === 'dining' || o.room === 'study' || o.room === 'kitchen') s += 1;
  if (selectedTemp && o.temp?.includes(selectedTemp)) s += 2;
  if (o.category?.includes('一次性')) s -= 1;
  return s;
}
function stopAction(reason='收到停止或取消指令'){
  pendingClarification = null; currentTarget = null; robotBusy = false; selectedTemp = null; conversationLocked = false; updateTempChoices();
  setRobotMode('stop'); setBubbleMode(''); setProcessStep(0); highlightRoom(null); clearObjectState(); $('robot').dataset.carry = ''; $('routeLine').classList.remove('active'); moveRobotHome();
  setBubble(`好的，我已停止当前动作。原因：${reason}`, { force:true, unlock:true });
  setDecision({ action:'stop', reason });
}
