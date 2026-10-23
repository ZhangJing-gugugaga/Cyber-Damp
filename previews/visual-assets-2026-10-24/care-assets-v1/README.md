# 护理与采摘资产第一批

入口：index.html。只展示一枚 WorkBuddy 图标，复用已认可的绿苔侵角中度资产，不再扩展霉菌或多图标对照。

## 资产

- round / cluster / fan：三种独立蘑菇，各有 bud、mature 状态，共 6 件。
- sponge / scissors / cloth：三种工具，各有 idle、active 状态，共 6 件。
- foam / droplets / crumbs / stump：泡沫、水滴、霉屑、采摘残根，共 4 件。
- mat / basket：护理垫、收集篮，共 2 件。
- 每件均提供 256×256 透明 SVG 和 PNG；manifest.json 为资产清单。

## 视觉与来源

延续当前项目获认可的简洁漫画材质，使用项目自行绘制的矢量路径，不依赖 emoji，不使用旧版写实菇或商业游戏角色。复用现有图标提取、Canvas 擦除、透明 PNG 导出方式，仅补充缺少的蘑菇、工具与接触反馈。GitHub 检索 svg mushroom game icons 未找到适合直接接入的完整资产方案。此次未调用生图 API。

## 交互验证

在浏览器中检查了成熟菇采摘计数、幼菇不可采摘、海绵拖动清洗、物种切换、工具状态、擦水布仅反馈不改变霉斑、透明 PNG 和移动端横向溢出，记录见 validation.json。

幼体 / 成熟是分离素材，不代表已实现完整生长动画。擦水布目前只有水滴接触反馈，尚未接入水渍清理。未修改 Electron 产品或真实桌面；新资产待用户视觉确认。

## 构建

运行 node build.cjs 可重新生成 SVG、清单与内嵌演示图片；PNG 来自浏览器对 SVG 的透明栅格化。预览本身无需构建或联网。
