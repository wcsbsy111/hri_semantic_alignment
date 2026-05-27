# HRI Semantic Alignment Prototype

[中文](README.zh-CN.md) | English

A web-based prototype for demonstrating **multimodal semantic alignment in human-robot interaction**.  
The system combines multimodal perception, a home semantic map, ambiguity clarification, task planning, and robot execution animation.

Online demo:

```txt
https://hri-semantic-alignment.github.io/
```

## Overview

The prototype includes two main pages:

1. `index.html`  
   Multimodal perception page. It captures user posture, facial expression, and speech, then broadcasts a dynamic semantic state pool through `BroadcastChannel` and `localStorage`.

2. `semantic_home_scene.html`  
   Home semantic map page. It receives multimodal states, combines them with a home semantic map, and supports clarification, task planning, and robot execution animation.

## Project Structure

```txt
project/
  index.html
  semantic_home_scene.html
  README.md
  README.zh-CN.md
  .nojekyll
  .gitignore

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
      sceneBootstrap.js

  styles/
    base.css
    index.css
    scene.css

  semantic_map_examples/
    README.md
    semantic_map_schema_note.json
    examples/
      00_home_household_general.json
      01_kitchen_meal_prep.json
      02_home_office_study.json
      03_living_room_assistance.json
      04_entryway_outing.json
      05_cleaning_laundry.json
      06_first_aid_care.json
      07_children_activity_cleanup.json
```

## How to Use

### 1. Open the website

Visit:

```txt
https://hri-semantic-alignment.github.io/
```

The home page `index.html` is the multimodal perception page. It supports:

- posture detection based on PoseNet;
- facial expression recognition based on face-api.js;
- speech recognition based on browser `SpeechRecognition` / `webkitSpeechRecognition`;
- dynamic semantic state broadcasting.

Click the entrance button to open `semantic_home_scene.html`.

### 2. Use multimodal input

The system supports several types of input:

- **Posture input**: hand raising, pointing left/right, reaching forward, etc.
- **Facial expression input**: neutral, happy, sad, angry, surprised, etc.
- **Speech input**: natural language commands through browser speech recognition.
- **Text input**: typed commands in the console of `semantic_home_scene.html`.

Example commands:

```txt
Bring me the TV remote.
Move the phone charger to the living room.
Bring me the keys.
Move the tissue box to the coffee table.
Put the pen back in the study.
```

The system will perform:

```txt
user input
→ semantic map object matching
→ ambiguity detection
→ clarification or task planning
→ robot pickup, delivery, relocation, or return
→ semantic map state update
```

## Semantic Map Examples

The semantic map can be replaced by uploading a JSON file in `semantic_home_scene.html`.

Example maps are provided in:

```txt
semantic_map_examples/examples/
```

Available example scenes:

```txt
00_home_household_general.json       General household assistance
01_kitchen_meal_prep.json            Kitchen meal preparation
02_home_office_study.json            Home office / study
03_living_room_assistance.json       Living room assistance
04_entryway_outing.json              Entryway / outing preparation
05_cleaning_laundry.json             Cleaning and laundry
06_first_aid_care.json               First-aid item retrieval
07_children_activity_cleanup.json    Children activity and toy cleanup
```

The current page layout uses fixed room keys:

```txt
kitchen / dining / living / study / bathroom / cabinet / user
```

When creating a custom map, it is recommended to keep these keys and modify only `label`, `aliases`, and `objects`.

## Local Development

Do not open the HTML files by double-clicking them.  
Start a local static server from the project root:

```bash
python3 -m http.server 8000
```

Then visit:

```txt
http://localhost:8000/
```

## GitHub Pages Deployment

This project can be directly hosted with GitHub Pages.

Current online URL:

```txt
https://hri-semantic-alignment.github.io/
```

To deploy your own version:

1. Create a GitHub repository.
2. Upload all project files to the repository root.
3. Go to `Settings → Pages`.
4. Select `Deploy from a branch`.
5. Select the `main` branch and `/root` folder.
6. Save and visit your GitHub Pages URL.

## Browser Notes

- Camera and microphone access require HTTPS or localhost.
- Chrome / Edge is recommended.
- Speech recognition depends on browser support for `SpeechRecognition` / `webkitSpeechRecognition`.
- The browser will ask for camera and microphone permissions when first used.

## API Key Notes

This version is a static front-end prototype. Do not hard-code a real DeepSeek API Key in the front-end source code.

For a public AI-enabled deployment, a backend proxy is recommended:

```txt
GitHub Pages frontend → Vercel / Render / Railway backend API → DeepSeek API
```

The API Key should be stored in backend environment variables, not in the front-end code.

## Contact

For questions or feedback, please contact:

```txt
wyufeng@zju.edu.cn
```
