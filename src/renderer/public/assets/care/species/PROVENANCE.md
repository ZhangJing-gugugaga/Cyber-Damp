# 品种素材来源（species/）

- 源 SVG：`_sources/01…13-…-透明.svg`，来自美术包「蘑菇图标-差异化修改版/透明菌群/」（E:\Desktop\蘑菇图标-差异化修改版(1)\），2026-10-26 由员工 1 复制入库。
- PNG（mature/bud × 256/48/32、silhouette）由 `npm run assets:species`（scripts/build-species-assets.cjs，Electron Canvas 光栅化）生成，可随时重建。
- **幼菇为临时资产**：成熟图 56% 缩小 + 去饱和，`manifest.json.temporary` 已标记；最终幼菇需独立轮廓与状态的美术稿，不能把临时版当成最终视觉通过。
- 对照图（合成版本 A/B × 13 品种 × 幼/成 × 256/48/32）见 `previews/species-assets-2026-10-26/composite-sheet.png`，底板为程序绘制的通用文件夹形状（仅演示），未使用美术包「叠加图标/」里的第三方软件 logo 预览图。
- 品种 ID 与契约对应关系（01–13 → bubble…rain-crown）见 `src/shared/types/gameplay.ts` 与 `species-manifest.json`。
