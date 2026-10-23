# 多材质连续样片（2026-10-21）

本轮实验另存于此，认可基线 `previews/mildew-lifecycle/` 不修改。实际预览入口为 `src/renderer/effects.html`，材质调用正式 `FileSprite`、`MaterialFilter`、`TwistFilter`、`BulgePinchFilter` 与 `mildew-surface`，不复制另一套桌面或存档逻辑。

在项目根运行 `npm run dev -- --host 127.0.0.1`，打开 `http://127.0.0.1:5173/effects.html`。十二个入口分别为发霉、缩水、焦化卷边、皱褶、吸湿软塌、护理恢复，各两种变体。可重播、暂停、拖动进度、复位、切换原图；三个代表对象同时显示48px与2.5倍放大。护理只是预览曲线，正式场景不自动清洗。

两套界面分别为 `manage.html?preview=1` 和 `manage.html?preview=1&layout=inventory`；可用 `page=care`、`page=settings` 查看另外两页。独立界面使用合成夹具，购买复用现有商品表和购买校验；不读取或更改真实文件。

检查与录制：先 `npm run build`，再启动开发预览服务器，运行 `node_modules/.bin/electron.cmd scripts/preview-game-ui.cjs --effects --motion`。输出在 `logs/game-ui-preview/`：两种界面各三页、十二种材质各0/50/100%帧和连续WebM。它们是独立预览证据，不能代表原生桌面或便携包已验收。

来源：文件夹沿用冻结样片的只读Shell图像，仅供本地预览；彩色应用示例沿用项目自有蘑菇标志；浅色文档直接抽取项目已有中性纸页兜底绘制。效果页不是默认生产构建入口，不把研究用Shell图像加入安装包。旧道具图集来源保持在 `src/renderer/assets/PROVENANCE.json`。

当前局限：需继续做独立mask并集测量与正常尺寸识别性验收；十二个入口不表示十二种最终美术均已获认可。生产仍使用真实运行时状态，新增预览曲线不写入存档。

2026-10-22补充：页面增加“变形后联合覆盖”，将独立霉斑/菇体路径mask与当前焦化/折痕着色权重，经过同一套UV卷曲、Twist、Bulge和缩水变换后测量。复用Pixi内置提取，不引入新渲染器或图像依赖；不从画面RGB差值推算遮挡。投影面积另列，水光/颜料不计入本次联合mask。

运行 `node_modules/.bin/electron.cmd scripts/preview-game-ui.cjs --composite --output=logs/composite-review-20261022-final`，再用现有 `python scripts/check-mildew-masks.py logs/composite-review-20261022-final` 独立复算。`canvas-*.png`直接导出当前画布并记录目标进度，作为材质关键帧；`effect-*.png`为离屏页面截图，可能受Chromium合成延迟影响，不单独用于判断目标进度。测量另检查前后场景像素保持一致，防止诊断模式留在实际画面。

后续源码补充：`specials.html`演示旧特殊菇素材的根部固定形变与点击。`scripts/preview-game-ui.cjs --effects --specials --output=logs/rooted-review-20261021`将本次证据另存；随后`python scripts/check-mildew-masks.py logs/rooted-review-20261021`用现有Pillow独立核对48/60/96/128像素的霉变mask。当前144项一致、最大约51.48%；范围仅为变形前霉斑、菇体及接触阴影，不能代替焦化/形变后的联合测量、原生DPI或用户辨识性验收。


2026-10-22：用户已明确否定原工具棚的网页感。当前新增第三种完整游戏物品柜预览：`http://127.0.0.1:5173/manage.html?preview=1&layout=workbench&page=shop`，含左侧分类、中央陈列、底部操作托盘；设置页参数改为`page=settings`。原cabinet/inventory仅作历史候选对照，不代表已获认可。当前游戏菜单直接复用Kenney CC0材质，来源/哈希见`src/renderer/assets/kenney-ui/PROVENANCE.json`。新增样式不改变冻结霉变样片。
