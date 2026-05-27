/* Semantic map renderer.
   Responsibility: render rooms/objects, highlight candidates, and keep map cards in sync. */
function objectGlobalPosition(obj){
  if (obj.room === 'user') return { x: obj.x || userObjectSpot.x, y: obj.y || userObjectSpot.y };
  const house = $('house').getBoundingClientRect();
  const r = roomEl(obj.room).getBoundingClientRect();
  const xPx = r.left - house.left + r.width * (obj.x || 50) / 100;
  const yPx = r.top - house.top + r.height * (obj.y || 50) / 100;
  return { x: xPx / house.width * 100, y: yPx / house.height * 100 };
}
function renderObjects(){
  document.querySelectorAll('.object').forEach(el => el.remove());
  semanticMap.objects.forEach(obj => {
    const el = document.createElement('div');
    el.className = 'object' + (obj.room === 'user' ? ' at-user' : '');
    el.dataset.id = obj.id;
    el.innerHTML = `<div class="icon">${obj.icon || '☐'}</div><div class="label">${obj.name}</div><div class="loc">${obj.location || ''}</div>`;
    el.addEventListener('click', () => onObjectClick(obj.id));
    if (obj.room === 'user') {
      el.style.left = (obj.x || userObjectSpot.x) + '%';
      el.style.top = (obj.y || userObjectSpot.y) + '%';
      $('house').appendChild(el);
      return;
    }
    const room = roomEl(obj.room);
    if (!room) return;
    el.style.left = (obj.x || 50) + '%';
    el.style.top = (obj.y || 50) + '%';
    room.appendChild(el);
  });
}
function renderSemanticMap(){
  const rows = semanticMap.objects.map(obj => {
    const tag = obj.room === 'user' ? '用户手边' : (obj.waterSuitable ? '可饮水' : '可移动');
    const scoreClass = obj.room === 'user' ? 'score move' : (obj.waterSuitable ? 'score' : 'score handover');
    return `<div class="map-row"><div>${obj.icon || '☐'}</div><div><b>${obj.name}</b><span>${roomLabel(obj.room)}｜${obj.location || ''}｜${obj.category || ''}</span></div><div class="${scoreClass}">${tag}</div></div>`;
  });
  $('mapBox').innerHTML = rows.join('');
}
function updateTempChoices(){
  document.querySelectorAll('#tempChoices .choice').forEach(btn => btn.classList.toggle('active', btn.dataset.temp === selectedTemp));
}
document.querySelectorAll('#tempChoices .choice').forEach(btn => btn.addEventListener('click', () => {
  selectedTemp = btn.dataset.temp;
  updateTempChoices();
  if (pendingClarification) {
    pendingClarification.temp = selectedTemp;
    const candidates = pendingClarification.candidates || [];
    if (pendingClarification.type === 'handover') {
      return setBubble(`当前任务是只拿取物品，不需要选择水温。请直接点击你要我拿的对象。`, { force:true, lock:true });
    }
    if (candidates.length === 1 && candidates[0].waterSuitable) {
      return executePickup(candidates[0], selectedTemp);
    }
    setBubble(`已选择${tempLabels[selectedTemp]}。现在请再选择一个具体杯子，或直接说出杯子名称。`, { force:true, lock:true });
    setDecision({ action:'clarify', reason:'水温已明确，但杯具仍未唯一确定。', missing:{ object:true }, candidate_count:candidates.length });
  }
}));

function markCandidates(ids, blockedIds=[]){
  clearObjectState();
  ids.forEach(id => { const el = document.querySelector(`.object[data-id="${id}"]`); if (el) el.classList.add('candidate'); });
  blockedIds.forEach(id => { const el = document.querySelector(`.object[data-id="${id}"]`); if (el) el.classList.add('blocked'); });
}
function selectObject(id){
  clearObjectState();
  const el = document.querySelector(`.object[data-id="${id}"]`);
  if (el) el.classList.add('selected');
}
