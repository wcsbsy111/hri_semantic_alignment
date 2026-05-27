# 语义地图案例库（兼容当前家庭场景页面）

这些 JSON 均沿用当前网页默认语义地图格式：

- 固定 `rooms` key：`kitchen / dining / living / study / bathroom / cabinet / user`
- 每个对象均保留：`id / name / icon / category / room / location / aliases / waterSuitable / hygiene / temp / x / y / note / homeRoom / homeLocation`
- 可以在 `semantic_home_scene.html` 的“用户上传语义地图”处直接导入。

> 注意：当前网页底层仍保留部分“喝水 / 水温 / 杯具”逻辑。以下案例主要用于测试“拿取 / 移动 / 递送 / 归位 / 模糊指代澄清”等家庭任务。

## 文件列表

- `00_home_household_general.json`：12 个对象
- `01_kitchen_meal_prep.json`：12 个对象
- `02_home_office_study.json`：12 个对象
- `03_living_room_assistance.json`：12 个对象
- `04_entryway_outing.json`：12 个对象
- `05_cleaning_laundry.json`：12 个对象
- `06_first_aid_care.json`：12 个对象
- `07_children_activity_cleanup.json`：12 个对象


## 推荐测试方式

1. 打开 `semantic_home_scene.html`
2. 在右侧“用户上传语义地图”上传任意 JSON
3. 使用输入框测试自然语言任务

示例指令：

```text
把电视遥控器拿给我
把手机充电器拿到客厅
把钥匙串拿给我
把饭碗拿到餐桌
把创可贴盒拿给我
把红色积木放回收纳柜
```

## 自定义原则

不要随意新增页面不认识的 room key。  
如果想换房间名称，可以改 `rooms.<key>.label` 和 `aliases`，但建议保留 key 本身。

例如可以把：

```json
"kitchen": {
  "label": "厨房/备餐台",
  "aliases": ["厨房", "备餐台", "操作台"]
}
```

但不要改成：

```json
"desk": {
  "label": "书桌"
}
```

除非你同时修改页面布局和渲染代码。
