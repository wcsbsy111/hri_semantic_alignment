/* Page bootstrap for index.html. */
(function bootstrapDetectionPage(){
  function start(){
    if (!document.getElementById('video')) return;
    if (typeof initPerceptionCamera === 'function') {
      initPerceptionCamera();
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
