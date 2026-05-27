# Refactor Notes

本次拆分将原来的两个大 HTML 文件整理为静态 GitHub Pages 项目：

- `styles/index.css`：采集页样式。
- `styles/scene.css`：语义地图页样式。
- `src/bridge/stateBridge.js`：采集页状态池与页面桥接。
- `src/perception/*`：姿态、表情、语音采集。
- `src/map/*`：语义地图数据与渲染。
- `src/planner/*`：规则解析、LLM 兼容层、多任务校验。
- `src/robot/*`：机器人状态、动画和执行逻辑。
- `src/ui/*`：页面初始化、控制台、澄清选择区。

为了保持现有演示可运行，本次采用浏览器普通脚本加载方式，而不是 ES Module / 打包器。这样上传 GitHub Pages 后可以直接访问，不需要 npm build。

后续如果继续专业化，建议再进行第二阶段重构：

1. 改成 ES Module：`import/export`。
2. 删除所有 inline `onclick`，统一使用 `addEventListener`。
3. 用 `window.AppState` 或类封装全局变量。
4. 把 DeepSeek 调用迁移到后端代理。
5. 增加 `tests/` 对 parser、validator、semanticMap 做单元测试。
