/* Speech tracker.
   Responsibility: convert browser speech recognition or demo input into semantic speech tokens. */
function analyzeSpeechToken(text) {
  const clean = (text || '').trim();
  if (!clean) return { token:'NO_SPEECH', text:'', confidence:0 };
  if (/停|停止|别动|不要动|取消|算了|不要/.test(clean)) return { token:'STOP_OR_CANCEL_COMMAND', text:clean, confidence:.95 };
  if (/热水|开水|温水/.test(clean)) return { token:'HOT_WATER', text:clean, confidence:.92 };
  if (/冷水|冰水|凉水/.test(clean)) return { token:'COLD_WATER', text:clean, confidence:.92 };
  if (/喝水|饮水|口渴|一杯水|倒杯水|接杯水|拿杯水|饮水机/.test(clean)) return { token:'DRINK_WATER_REQUEST', text:clean, confidence:.92 };
  if (/杯|玻璃杯|陶瓷杯|保温杯|马克杯|运动水杯|塑料杯|漱口杯|茶杯|高脚杯|红酒杯|啤酒杯|咖啡杯|纸杯/.test(clean)) return { token:'CUP_SPECIFIED', text:clean, confidence:.9 };
  if (/拿|取|递|给我|帮我拿|帮我取/.test(clean) && /那个|这个|那边|这里|它/.test(clean)) return { token:'TAKE_DEICTIC_OBJECT', text:clean, confidence:.9 };
  if (/放|移动|移到|放到|拿到/.test(clean) && /那边|这里|那里|左边|右边/.test(clean)) return { token:'MOVE_DEICTIC_OBJECT', text:clean, confidence:.88 };
  if (/左边|右边|前面|后面|这里|那里|那边|这个|那个|餐桌|茶几|柜子|洗漱台|书桌|厨房|客厅|卫生间/.test(clean)) return { token:'SPATIAL_REFERENCE', text:clean, confidence:.78 };
  if (/帮我|可以|能不能|请/.test(clean)) return { token:'GENERAL_HELP_REQUEST', text:clean, confidence:.72 };
  return { token:'GENERAL_SPEECH', text:clean, confidence:.65 };
}

const voiceBtn = document.getElementById('voiceBtn');
const clearVoiceBtn = document.getElementById('clearVoiceBtn');
let rec, isListening = false;
if (window.SpeechRecognition || window.webkitSpeechRecognition) {
  const R = window.SpeechRecognition || window.webkitSpeechRecognition;
  rec = new R(); rec.lang = 'zh-CN'; rec.continuous = true; rec.interimResults = true;
  rec.onresult = e => {
    let s = ''; for (let i=e.resultIndex; i<e.results.length; i++) s += e.results[i][0].transcript;
    finalVoiceText = s; voiceResult.innerText = s;
    const speechState = analyzeSpeechToken(s);
    updateState('speech', { token:speechState.token, text:speechState.text }, speechState.confidence, STATE_TTL.speech);
  };
  rec.onend = () => { isListening = false; voiceBtn.innerText = '开始语音识别'; };
}
voiceBtn.onclick = () => {
  if (!rec) { voiceResult.innerText = '❌ 当前浏览器不支持语音识别'; return; }
  if (!isListening) { rec.start(); isListening = true; voiceBtn.innerText = '停止识别'; voiceResult.innerText = '🎤 聆听中...'; }
  else { rec.stop(); isListening = false; voiceBtn.innerText = '开始语音识别'; }
};
clearVoiceBtn.onclick = () => { statePool.speech = null; finalVoiceText = ''; voiceResult.innerText = '语音状态已清空'; renderStatePool(); broadcastStateToGame(); };
document.getElementById('demoVoiceBtn').onclick = () => {
  const text = '我想喝水';
  voiceResult.innerText = text;
  const s = analyzeSpeechToken(text);
  updateState('speech', { token:s.token, text:s.text }, s.confidence, STATE_TTL.speech);
  broadcastStateToGame();
};
