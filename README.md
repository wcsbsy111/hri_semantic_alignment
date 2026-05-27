# HRI Semantic Alignment Prototype

服务机器人多模态语义对齐原型，用于展示：

1. 采集页 `index.html`：采集姿态、表情、语音，并通过 `BroadcastChannel` / `localStorage` 广播动态语义状态池。
2. 家庭语义地图页 `semantic_home_scene.html`：接收多模态状态，结合家庭语义地图进行澄清、任务规划与机器人执行动画。

## 目录结构

```txt
project/
  index.html
  semantic_home_scene.html
  src/
    bridge/
      stateBridge.js
    perception/
      poseTracker.js
      faceTracker.js
      speechTracker.js
    map/
      semanticMap.js
      mapRenderer.js
    planner/
      llmPlanner.js
      ruleValidator.js
      taskParser.js
    robot/
      robotExecutor.js
      robotStateMachine.js
    ui/
      dom.js
      panels.js
      clarificationDock.js
  styles/
    base.css
    index.css
    scene.css
```

## 本地运行

不要直接双击 HTML 文件。建议在项目根目录启动一个本地静态服务器：

```bash
python3 -m http.server 8000
```

然后访问：

```txt
http://localhost:8000/
```

## GitHub Pages 部署

1. 新建 GitHub 仓库。
2. 上传本项目所有文件。
3. 进入仓库 `Settings → Pages`。
4. Source 选择 `Deploy from a branch`。
5. Branch 选择 `main`，目录选择 `/root`。
6. 保存后访问：

```txt
https://你的用户名.github.io/仓库名/
```

## 浏览器说明

- 摄像头、麦克风需要 HTTPS 或 localhost。
- 推荐使用 Chrome / Edge。
- 语音识别依赖浏览器的 `SpeechRecognition` / `webkitSpeechRecognition`，部分浏览器可能不可用。

## API Key 说明

当前版本仍然是静态前端演示版。不要把真实 DeepSeek API Key 写死在前端代码里。
如需公开给别人完整体验 AI 推理，建议增加后端代理：

```txt
GitHub Pages 前端 → Vercel/Render/Railway 后端接口 → DeepSeek API
```

API Key 应放在后端环境变量中。
