# 修复工具调研与资产映射

日期：2026-10-24。目的：为回南天补充有现实依据、轮廓清楚、操作不同的护理工具。本文是游戏设计研究，不是将所有图标等同于某一种真实材料的清洁指南。

## 结论

1. 清除霉斑、去除表面水分、环境调湿、清除烟灰、修饰焦痕是不同任务。它们不能由同一把海绵承担。
2. 现实清洁受材料限制。图标没有统一物理材质，游戏中把它作为可护理表面，是明确的简化。
3. 采用拖动刷洗、点击按压、长条刮水、持续吹干、点按吸灰、滚动补色六类动作建立工具差异。
4. 不新增桌面交互，不新增自然变化或霉变资产，只在同一普通窗口处理同一枚图标的三种已有材质。

## 官方资料与可复用工具

| 任务 | 资料结论 | 工具资产 | 游戏映射与边界 |
|---|---|---|---|
| 发霉 | EPA 对硬表面给出水与清洁剂配合擦洗、然后彻底干燥的路线；控制水分是关键。[S1] | 清洁喷壶、清洁刷；复用海绵 | 喷洒增加可见雾点并软化霉斑，刷子和海绵负责移除。喷一下不直接全清；该路线不泛化到纸张等多孔材料。 |
| 受潮、表面水分 | 国家档案馆提到吸水材料、较凉爽干燥的位置及空气流通；过热可能损伤材料。[S2] | 吸水纸、冷风干燥器；复用擦水布 | 吸水纸按压去除小块表面水分；擦水布拖动；干燥器长按时逐渐减淡局部水渍。干燥器借鉴通风，不设计热烘复原或去霉功能。 |
| 光滑面残水 | Kärcher 的产品说明将刮水及吸水用于窗面、镜面等光滑面。[S3] | 刮水器 | 宽而窄的条形清理轨迹，建立“刮过一条干净线”的手感。这里采用手动橡胶刮水器形态，不照搬商标、配色或具体产品。 |
| 烟灰 | 国会图书馆介绍以硫化橡胶海绵轻按吸附烟灰，并提到温和刷子可帮助移走集中的松散污物。[S4] | 烟灰海绵、软毛刷 | 海绵点按去灰而非来回擦；刷子扫灰。烟灰与底下焦痕独立，不一起消失。 |
| 灰尘、残留颗粒 | 加拿大保护研究所介绍软刷与吸尘配合等材料保护方法；国家档案馆也记录专门清理海绵等工具。[S5][S6] | 本轮采用软毛刷；吸尘设备保留作后续候选 | 不把普通干刷描绘为可处理所有活跃霉菌的通用工具，不增加现实化作业流程。 |
| 环境调湿 | 加拿大保护研究所区分主动环境调湿设备与密闭空间内硅胶等被动湿度缓冲。[S7] | 除湿机、吸湿包 | 环境道具只展示开关或干湿状态，不擦掉既有污渍，不在本次资产样片里接入后台除湿模拟。 |
| 真正焦化 | 火灾损伤包括变色、脆化、炭化及不可逆损伤，区别于附着烟灰。[S8] | 图标补色滚轮 | 这是虚构的外观复原工具：只恢复“图标画面”的焦痕区域。不将其宣称为现实中恢复烧焦纸、塑料或木材的办法。 |

## 资产与交互取舍

- 十种新工具 / 环境道具，各有正常与使用状态，共 20 件。
- 新增喷雾、气流、烟灰团、吸水反馈、补色贴片，共 5 件。
- 延续上一批可编辑 SVG 的漫画语言；每件提供透明 256×256 PNG。
- 小尺寸优先辨认轮廓：喷壶扳机、刷毛、吸水纸片、T 形刮水头、干燥器风口、方块海绵、长柄软刷、滚轮、除湿机水箱、吸湿包。
- 用浅绿表达霉斑清洁工具、雾蓝表达除水工具、米褐表达烟灰工具、灰紫表达虚构补色工具。
- 不添加漂白液、酸碱混合、热风烘干、火烤等操作来充实商品数量；本轮没有对化学配方的需求。
- 旧版已有写实风扇、吸湿盒和海绵等资产。形态和用途可借鉴；已确认当前需要轻量漫画风，沿用上一批矢量构建和 Canvas 擦除方式，补足不同轮廓及动作，不重写产品系统。
- GitHub 检索 `svg cleaning tools icons` 未找到可直接接入且满足当前双状态漫画风的完整方案；不引入额外依赖或复制第三方工具图形。官方资料提供用途依据，资产路径由本项目绘制。

## 来源

- [S1 · EPA：What are the basic mold cleanup steps?](https://www.epa.gov/mold/what-are-basic-mold-cleanup-steps)
- [S2 · 美国国家档案馆：Wet Records](https://www.archives.gov/preservation/holdings-maintenance/wet-records)
- [S3 · Kärcher：Cordless window cleaners](https://www.kaercher.com/ie/en/home-and-garden/products/window-vac-c6871)
- [S4 · 美国国会图书馆：Smoke, Soot, and Other Contamination](https://guides.loc.gov/wet-collections/smoke-and-soot)
- [S5 · 加拿大保护研究所：Care and Cleaning of Unfinished Wood](https://www.canada.ca/content/dam/cci-icc/documents/services/conservation-preservation-publications/canadian-conservation-institute-notes/cci-7-1-pdf-eng.pdf)
- [S6 · 美国国家档案馆：A Few of Our Favorite Tools](https://www.archives.gov/preservation/about/st-louis-preservation-branch/favorite-tools)
- [S7 · 加拿大保护研究所：Silica Gel, Passive Control of Relative Humidity](https://www.canada.ca/en/conservation-institute/services/conservation-preservation-publications/technical-bulletins/silica-gel-relative-humidity.html)
- [S8 · 加拿大保护研究所：Agent of deterioration, fire](https://www.canada.ca/en/conservation-institute/services/agents-deterioration/fire.html)

检索使用 agent-reach / Exa，并用官方网页核对具体用途。以上设计映射是本项目推导，资料不对游戏操作背书。
