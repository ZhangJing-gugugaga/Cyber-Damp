# 九种蘑菇 · Cyber-Damp

共 18 张可编辑 SVG 和 18 张 256×256 透明 PNG，保留统一底部根点。采用项目原有 JavaScript 编写 SVG 曲线、渐变及图层，再栅格化为 PNG 的方式；没有外部位图贴图。

| 文件前缀 | 外形 |
|---|---|
| round | 蜜杏圆帽 |
| cluster | 冰蓝钟形簇 |
| fan | 花瓣扇形 |
| enoki | 细柄金针簇 |
| bolete | 厚柄牛肝菌 |
| morel | 蜂窝羊肚菌 |
| puffball | 圆球马勃 |
| parasol | 红伞斑点菇 |
| coral | 分枝珊瑚菌 |

`-bud` 是幼体，`-mature` 是成熟态。幼体通过较小形态保持底部根点，没有生长动画。

- `svg/`：可编辑矢量图。
- `png/`：同源透明 PNG，本次由 sharp/librsvg 栅格化。
- `source/`：自绘路径及生成器。在本目录运行 `node source/build-svg.cjs` 重建 SVG（不重建 PNG）。
- `preview.html`：下载后用浏览器打开，查看幼体/成熟态和深浅底小尺寸效果。

固定配色，未实现 App 自动取色。本分支仅新增资产，不修改运行接线；九种外形不等于新增九种可掉落品种。Windows 原生图标实机效果尚未验收。
