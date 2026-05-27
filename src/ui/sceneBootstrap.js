/* Final semantic scene bootstrap.
   Responsibility: bind visible buttons after every module has loaded, and report missing module errors in the UI.
   This avoids fragile inline onclick handlers after splitting the original single HTML file into multiple JS files. */
(function(){
  const BOOT_FLAG = '__semanticSceneBootstrapReady';

  function $(id){ return document.getElementById(id); }
  function hasFn(name){ return typeof window[name] === 'function'; }
  function getInferenceFn(){
    if (typeof window.runSceneInference === 'function') return window.runSceneInference;
    if (window.__semanticV10 && typeof window.__semanticV10.runInferenceV9 === 'function') return window.__semanticV10.runInferenceV9;
    if (window.__semanticV9 && typeof window.__semanticV9.runInferenceV9 === 'function') return window.__semanticV9.runInferenceV9;
    return null;
  }
  function report(message){
    console.warn('[semantic bootstrap]', message);
    const bubble = $('bubble');
    if (bubble) bubble.textContent = message;
    const ai = $('aiStatus');
    if (ai) ai.textContent = message;
  }
  function cloneAndBind(id, handler){
    const old = $(id);
    if (!old) return;
    const el = old.cloneNode(true);
    old.replaceWith(el);
    el.addEventListener('click', function(event){
      event.preventDefault();
      try { handler(event); }
      catch (err) { report('按钮执行失败：' + (err && err.message ? err.message : err)); }
    });
  }
  function exportKnownFunctions(){
    // Function declarations from classic scripts are usually global already.
    // These assignments make the relation explicit and easier to debug in DevTools.
    const names = ['submitSceneText','demoAmbiguousWater','downloadDefaultMap','saveSceneApiKey','demoStop'];
    names.forEach(name => {
      try {
        // eslint-disable-next-line no-eval
        const fn = eval('typeof ' + name + ' === "function" ? ' + name + ' : null');
        if (fn && !window[name]) window[name] = fn;
      } catch(e) {}
    });
  }
  function bindButtons(){
    if (window[BOOT_FLAG]) return;
    window[BOOT_FLAG] = true;
    exportKnownFunctions();

    cloneAndBind('demoAmbiguousWaterBtn', () => {
      if (hasFn('demoAmbiguousWater')) return window.demoAmbiguousWater();
      report('演示按钮不可用：demoAmbiguousWater 没有加载。请检查 src/ui/panels.js 是否 404 或报错。');
    });

    const download = () => {
      if (hasFn('downloadDefaultMap')) return window.downloadDefaultMap();
      report('导出按钮不可用：downloadDefaultMap 没有加载。请检查 src/ui/panels.js。');
    };
    cloneAndBind('downloadDefaultMapTopBtn', download);
    cloneAndBind('downloadDefaultMapPanelBtn', download);

    cloneAndBind('sendTextBtn', () => {
      if (hasFn('submitSceneText')) return window.submitSceneText();
      report('发送按钮不可用：submitSceneText 没有加载。请检查 src/planner/taskParser.js。');
    });

    cloneAndBind('inferSceneBtn', async () => {
      const run = getInferenceFn();
      if (!run) return report('意图推理按钮不可用：runSceneInference 没有加载。请检查 src/planner/ruleValidator.js 是否成功加载。');
      await run();
    });

    cloneAndBind('saveSceneApiKeyBtn', () => {
      if (hasFn('saveSceneApiKey')) return window.saveSceneApiKey();
      report('保存 Key 按钮不可用：saveSceneApiKey 没有加载。请检查 src/robot/robotStateMachine.js。');
    });

    const ok = [
      ['semanticMap', typeof semanticMap !== 'undefined'],
      ['renderObjects', hasFn('renderObjects')],
      ['submitSceneText', hasFn('submitSceneText')],
      ['runSceneInference', !!getInferenceFn()],
      ['executeMoveObject', hasFn('executeMoveObject')]
    ];
    const missing = ok.filter(([,v]) => !v).map(([k]) => k);
    if (missing.length) report('页面模块未完整加载：' + missing.join('、') + '。请打开浏览器 Console / Network 检查 src 路径是否 404。');
    else {
      const status = $('aiStatus');
      if (status && /等待推理|不可用|失败/.test(status.textContent || '')) status.textContent = '页面模块已加载，可以输入任务并推理。';
    }
  }

  // Run after other modules' window.load listeners, so this becomes the final authority for visible buttons.
  window.addEventListener('load', bindButtons);
})();
