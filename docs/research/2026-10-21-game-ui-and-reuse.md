# 回南天：游戏 UI、动态效果与复用调研

实施补充：桌面选择核对了daedalOS的 `useFocusableEntries.ts`（MIT，提交f017b393d4175eb396a741a7562299423843f1b1）。其React状态hook不能直接用于当前Pixi/原生穿透控制，保留本项目PointerController并只补缺少的选择反馈；未复制第三方hook源码。实际复用位置、最小适配与验证见[体验增量记录](../EXPERIENCE-INCREMENT-2026-10-21.md)。

特殊菇进一步复用[Pixi 8.21.0 MeshPlane官方示例](https://github.com/pixijs/pixijs/blob/v8.21.0/src/scene/mesh-plane/MeshPlane.ts)的现成网格/顶点缓冲更新接口与已装依赖（MIT），仅补根部固定的顶点位移和形变UV命中；不复制渲染器。快捷键沿用[Electron 44.8.0官方注册失败处理](https://github.com/electron/electron/blob/v44.8.0/docs/api/global-shortcut.md)与本项目注册回调，只补可见冲突状态及同组合重试。PNG独立核对优先检查现有pngjs（未安装），随后复用已安装Pillow 12.2.0，不为测量添加新依赖。

日期：2026-10-21。本次调研使用 agent-reach 的 GitHub/网页路由、已连接的 GitHub 工具与公开网页搜索；参考 xerj-code 的先查实现再补缺口方法。读取官方产品页、仓库说明及指定源码，不把网页介绍当作本机游戏实测。

## 成熟桌面游戏与 GitHub

| 来源 | 核实内容 | 回南天采用的方向 | 复用边界 |
| --- | --- | --- | --- |
| [VPet Steam](https://store.steampowered.com/app/1920960/VPet/)、[仓库](https://github.com/LorisYounger/VPet) | 桌面互动产品；README 列出 ToolBar、购买窗口、设置窗口；[winBetterBuy.xaml](https://github.com/LorisYounger/VPet/blob/main/VPet-Simulator.Windows/WinDesign/winBetterBuy.xaml) 实际包含搜索、余额等购买界面结构 | 桌面仅放上下文工具；独立窗口按物品、购买与状态组织。大型标题、宣传文案不再占据主要操作空间 | 仓库代码 Apache-2.0，动画另有授权。WPF 代码不能直接作为 Electron 控件运行；借鉴布局与状态表达，不引入整套 WPF 或人物动画 |
| [Rusty's Retirement](https://store.steampowered.com/app/2666510/Rustys_Retirement/) | 官方定位是在屏幕底部运行、可同时做其他工作的轻量游戏 | 控件预算与场景边界收敛，工具围绕正在做的操作出现 | 商业游戏仅参考产品组织；本轮未启动游戏检查其完整商城，也不复制素材或照搬经营循环 |
| [Desktop Mate](https://store.steampowered.com/app/3301060/Desktop_Mate/) | 官方描述支持桌面角色与鼠标互动、窗口附着及内容扩展 | 桌面反应与角色/物件本身相连，避免主界面像独立宣传页 | 参考直接交互关系；本轮没有实测购买流程，不宣称已复用其实现 |
| [rexrainbow/phaser3-rex-notes](https://github.com/rexrainbow/phaser3-rex-notes)、[许可证](https://github.com/rexrainbow/phaser3-rex-notes/blob/master/LICENSE) | 有公开插件、UI 模板、示例与 MIT 许可；当前 README 已提及 Phaser4，具体实现需固定兼容版本 | 后续补缺口时参考商品格、详情和输入状态等成熟游戏控件模式 | 当前项目是 Pixi + DOM；不为复用一个控件更换引擎。优先使用本项目已存在的商城组件 |
| [pixijs/filters](https://github.com/pixijs/filters) | MIT；官方兼容表为 Pixi8 配 Filters6，与现有依赖一致；已有 BulgePinch、Twist 等效果及公开示例 | 先检查已有滤镜与本项目材质代码，再组合萎缩、鼓胀、扭曲效果 | 不升级依赖；滤镜能完成的变形不重写。卷边/皱褶等未覆盖部分才补局部形变或材质控制 |

以上为采用判断，不是对这些项目“所有功能都成熟/全部适用”的宣称；GitHub 检索不是检索到名字就复制代码。实施阶段按具体缺口固定文件、提交和许可证，先试用现成实现。

## 本地游戏技能包

已读取 `D:/AI-Config/library/legacy-d/gamedev/skills/team-ui/SKILL.md`、`vertical-slice/SKILL.md`，以及 `plugins/claude-code-game-studios/docs/templates/hud-design.md`、`ux-spec.md`。

采用其适用方法：区分场景 HUD 与主动打开的菜单；先规定常驻/上下文/按需信息；记录悬停、选中、不可购买、已拥有、装备中等状态；以一个完整可玩切片验证体验。当前仅研究方法，不启动整套团队委派、引擎迁移或额外审批流水线。技能被导入库保留不代表均已启用，也不需要为本轮计划批量启用整个技能包。

## 项目现成能力与真正缺口

| 已有位置 | 优先复用内容 | 只补缺口 |
| --- | --- | --- |
| `src/renderer/assets/PROVENANCE.json` 及道具图集、fan-parts、bolete-intact 来源记录 | 电扇、夹子、吸湿盒、普通/特殊菇等已有素材，先按目标风格调整消费方式 | 新效果缺少的分层、形变控制、UI 展示图；不因新版风格否定全部旧素材 |
| `src/renderer/ui/shop-panel.ts`、`toolbox.ts`、`src/world/shop-catalog.ts` | 商品目录、分类、购买/拥有/装备逻辑与工具动作 | 独立窗口统一的游戏式排布、状态反馈和收拢入口，不复制另一套购买业务 |
| `src/renderer/view/shaders/material-filter.ts`、`icon-material-surface.ts`、FileSprite 的拧干路径 | 湿润、焦化、干燥、透明轮廓采样、局部材质与现有 TwistFilter | 多效果样片参数、局部卷边/皱褶、效果组合与重播控制 |
| `src/renderer/view/mildew-surface.ts`、`previews/mildew-lifecycle/` | 已认可的连续发霉语言、稳定随机种子、幼芽伸柄展伞路径 | 更多菌落构图、强度与节奏变体，其他变化家族；冻结样片不覆盖 |
| `src/main/desktop/`、`src/main/native/` | 已认可位置/大小、Shell 图标、WorkerW、穿透与退出恢复 | 图标来源异常的具体回归，以及交互状态；不重写整条接管链 |
| `src/renderer/input/pointer-controller.ts`、`hit-tests.ts` | 单双击识别、拖动阈值、现有工具与命中逻辑 | 原生观感的选中/清选/焦点反馈，新变形画面与命中一致 |
| `management-window.ts`、`management-bridge.ts`、现有存档 | 普通独立窗口、托盘、快捷键、暂停/隐藏/退出与护理入口 | 页面层级、工具反馈、必要跨进程类型同步；不创建第二套状态系统 |

## 提议的 UI 结构

设计基调为“雨季工具柜”：桌面和商城共用同一套道具图标、材质、色板、按钮状态与短促反馈。保留可用的旧资产，按游戏控件组织信息；减少整屏标题、口号与宣传式留白。

- 桌面：一个可收拢的工具入口，点击展开常用工具；金币、天气等放入展开区或管理窗。选中对象出现上下文操作，常驻控件不得遮住原生图标和任务栏。
- 商城：紧凑标题/余额与分类导航，物品展示区，详情与购买/装备状态区；道具图占主体，支持悬停说明与明确的已拥有/使用中/不足状态。
- 设置：同一窗口内的分组操作页；显示、输入、声音、快捷键、暂停/隐藏/退出按实际已有能力呈现，不放不可用的占位功能。
- 不把“少框”解释成没有层级：物品格和详情面板用于操作，避免每段文字都包一张卡。

## 动态样片与素材来源

首轮至少六种效果家族，每类两个构图/节奏版本：发霉、萎缩/缩水、焦化卷边、皱褶、吸湿鼓胀/软塌、护理恢复。前四类为用户明确要求，后两类为可删改的创意实验，不引入新的强制经营规则。

用文件夹、彩色应用、浅色文档三个代表图标在原生比例并排查看；每条样片有连续过程、稳定结束和复位，能随时切换原图对照。生长强度可到 90% 遮挡，但原图轮廓/关键特征与文件名仍能辨认；不同图标错峰且随机结果跨帧稳定。变形只作用于画面，不改变 Explorer 布局与真实文件。

彩蛋优先检索网上原图和既有素材，不再要求自行生图；登记作者/原始 URL/许可/是否随包使用。优先可复用授权资源，预览引用与随包资源分开记录。图像来源工作不阻塞基础交互与商城重构。

## 2026-10-22 联合材质测量复用

- GitHub检索定位Pixi现成提取系统，随后核对已安装8.21.0对应的[GenerateTextureSystem源码](https://github.com/pixijs/pixijs/blob/v8.21.0/src/rendering/renderers/shared/extract/GenerateTextureSystem.ts)：使用内置`extract.canvas`的frame/resolution与RenderTexture流程，MIT依赖不变。根对象变换会被提取变换替代，因此保留图标变换在子容器上。
- 现成能力：独立霉变路径mask、正式MaterialFilter的UV/焦化/折痕、Twist/Bulge滤镜、现有Pillow复算脚本。实际缺口：把这些已有遮挡权重送入同一变形链，独立导出并集及投影面积。新增适配只在主动测量时执行，不另建材质演进或存档系统。
- 折痕改为局部着色，折痕间保留原画；不把全图均匀变色当作皱褶。冻结认可样片未修改。实际辨识性继续单独观察，mask比例不是用户感官验收。


## 2026-10-22 商城 / HUD 美术优先增量

- 编码前再次搜索 GitHub 的 Kenney/游戏 UI 资源；核对 Kenney 官方 RPG Expansion 页面（https://kenney.nl/assets/ui-pack-rpg-expansion）的 CC0 标记。该包的复古 RPG 按钮未直接导入，避免为了换皮替换整套成熟控件。
- 当前缺口是视觉组织、图集等比裁切和缺少的道具图形；购买、分类、余额、拥有/装备状态、护理、工具动作、麦克风与设置通路全部保留。
- 继续复用 household-atlas 的电扇/衣夹/吸湿盒。用嵌套 SVG 视口等比裁切原图，不重新绘制、不增加图片解码副本。
- 绳圈、铲子、喷雾复用 https://github.com/game-icons/icons ，固定版本82d948812bfe3f269ef8f731dcdb07b08160edc4。作者Delapouite/Lorc，CC BY 3.0；仅移除黑底和使用主题色，路径不改。来源及原始哈希见src/renderer/assets/game-icons/PROVENANCE.json，随包署名见renderer/licenses/game-icons.txt，设置页可展开署名。此处铲子是通用道具图，不宣称为PVZ原图。
- 配色：雨绿底#c9d3c3、纸面#edf0e1、苔绿#4d7051、旧木#c6ac82、详情纸#f5eed8、铜金#dbc18a。标题系统楷体优先，正文保留系统雅黑；不新增字体/框架/依赖。
- 商城开放搁板取代逐格描框，纸签显示价格，右侧保留可购买状态与动作。HUD六工具位配当前说明，保留原标签作无障碍名称/悬停提示；工具选择使用原控制器。
- 预览脚本暴露保留paint图像后写出空帧/旧帧的问题。最初尝试在paint事件内编码仍可收到空图；最终复用Electron内置capturePage，并检查PNG有效性。参考官方离屏示例https://github.com/electron/electron/blob/64f1326109f3e1f29ef046e15f4f7090b6e2b0ad/docs/tutorial/offscreen-rendering.md。旧截图不用于本轮视觉验收；当前预览图与原生截图分别记录。


## 2026-10-22 道具辨识补充

- 先检索同一固定Game Icons源树，确认Delapouite的straight-pipe/clothespin及许可。钢杆复用直管图形，发热夹复用不同开口轮廓；不将钢杆继续画作绳圈，不复制商品/装备业务。新增两图同样仅去黑底与主题着色，完整来源/原始哈希已加入PROVENANCE及随包署名。
- 十商品逐项选择、标题对应、可见购买按钮及独立截图加入现有preview-game-ui.cjs的--shop-art分支，仍为独立预览证据。
- 核对旧shop-panel和world-actions：消耗品可重复购买，不加入owned；旧独立预览却将所有购买都加入owned，买一次就显示已拥有。预览现复用同一purchase方法，并遵守现有消耗品排除及购买即装备规则；管理UI也明确排除消耗品的owned状态，避免旧存档误阻塞。未改价格、库存或生产购买通路。
- 独立预览连续各购两次喷雾和吸湿盒，余额180→160→140→110→80，购买按钮仍可用。不能将fixture的吸湿盒视为实际原生放置验证；实际放置继续由既有buyBoxes/BoxController负责。


## 用户否定网页感后的游戏物品柜

- 用户2026-10-22明确反馈0.1.17仍像网页；原工具棚候选未获认可。该反馈优先于此前对素材少框化的自行判断，不再只替换颜色或图标。
- 已检查Tiny Pasture官方Steam app3167550截图：截图3展示左侧分类/商品阵列，截图5展示设施操作；截图0为带宣传文字的场景示意，不能混称为无修饰实机商店。参考只保留场景入口、道具主导、紧凑游戏菜单，不复制像素资产/品牌/文案。原图只留忽略的logs/game-menu-references，未混入发行资源。
- 编码前GitHub检索panel_brown.png及Kenney UI pack，找到Godot示例等复用入口；随后直接核对Kenney官方源包。采用UI Pack Adventure源包，其License.txt标注CC0、允许个人/教育/商业使用。官方页面https://kenney.nl/assets/ui-pack-adventure；精确下载URL、压缩包和单图SHA256见src/renderer/assets/kenney-ui/PROVENANCE.json。来源图片未重绘，使用现有CSS border-image九宫缩放；署名/许可随包附带。
- management.ts只重排原场景控制节点与状态节点，不增加第二套命令/购买/设置控制器。新增game-workbench.css为当前布局，原cabinet/inventory候选仍能独立对照。右侧详情改为底部操作托盘，商城不显示无关场景管理按钮，既有快捷键/托盘/设置入口保留。
- HUD仍复用六工具控制器、钱包售卖落点和天气，统一柜体材质；没有新建渲染引擎、商店模型或经济规则。
- 预览增加第三布局，并显式等待离屏合成呈现后截图；最初workbench-game-first的首张主商城图仍残留前一页画面，不作美术依据。后续workbench-game-reviewed已实际观察新的物品柜，发现并修复分类换列与按钮文字对比度；最终版本另记录，不将中间图混为最终包通过。


## 2026-10-22 窗口壳复用

用户认可UI，要求改善弹窗外壳。编码前GitHub搜索Electron的frameless/drag/transparent实现，并核对官方Custom Window Styles与Custom Window Interactions（https://www.electronjs.org/docs/latest/tutorial/custom-window-styles ，https://www.electronjs.org/docs/latest/tutorial/custom-window-interactions）。复用BrowserWindow frame:false/transparent、原生minimize/restore/close和CSS app-region；不另写拖动算法或窗口引擎。按官方透明窗限制禁用原生缩放/最大化，启动尺寸适配工作区。保留原close事件隐藏管理窗路径、快捷键、托盘、购买/护理命令；仅补限定发送方的两种窗口动作与自有按钮，shared/preload/IPC契约核对并升v1.8。透明边缘只承担轮廓，不宣称能点击穿透。
# 2026-10-22 输入与性能补充检索

- 启动交付补查[Electron Builder官方portable模板](https://github.com/electron-userland/electron-builder/blob/5172ff6a3c59f11f490834439912bd41b9b54bdc/packages/app-builder-lib/templates/nsis/portable.nsi)：每次启动先清理临时目录并提取应用，运行后再次删除。沿用工具原生zip目标提供一次解压、直接运行完整目录的分发，不另写启动器或缓存解包器。构建命令：`electron-builder --win portable zip --x64 --config.electronDist=node_modules/electron/dist`。

- GitHub检索：`game development skills`、`setIgnoreMouseEvents repo:electron/electron`、`set filters repo:pixijs/pixijs`，并检查当前仓库输入、材质图集、原生扫描及恢复监护。未发现能直接覆盖本项目Explorer替身、原生布局和所有工具的整套即用方案，因此保留现有实现，仅补职责边界。
- [Electron官方窗口文档](https://github.com/electron/electron/blob/64f1326109f3e1f29ef046e15f4f7090b6e2b0ad/docs/api/base-window.md)：复用已有`setIgnoreMouseEvents`与主进程`globalShortcut`能力。forward只保证鼠标移动转发，不能推定桌面子窗已有键盘焦点。没有复制外部实现或新增依赖。
- [Phaser InputManager](https://github.com/phaserjs/phaser/blob/02d8931b626d9764c133cbb3fbf99966c03c757c/src/input/InputManager.js)，MIT：参考集中管理默认/对象光标、resetCursor恢复默认状态；不引入Phaser运行时。
- [Godot游戏开发技能：性能优化](https://github.com/bgrenat/godot-game-dev-studio/blob/cb2e2cb6bedeada7140d73a0f45a93db1964e634/skills/godot-performance-optimization/SKILL.md)：只参考先profiling、识别瓶颈、共享纹理与分散更新的方法论。Godot版本陈述未作为本项目事实采信，也不搬运GDScript、不安装整套技能或更换引擎。
- [Pixi官方滤镜实现与示例](https://github.com/pixijs/pixijs/blob/65552017d23255c1442a7d4ac7f0d49e3225fb1d/src/filters/__docs__/filters.md)：结合本机锁定依赖检查filters setter，确认并非每次赋值都重建渲染结构；没有依据错误假设做整套滤镜重构。

实际复用：现有工具箱select/getTool、PointerController、HarvestController、管理IPC、Electron快捷键与原生桌面探针；现有canvas-atlas与mildew-surface；现有恢复监护提前并行准备。新增仅为工具归属、Esc桥接、自动播放和已测开销的局部调整。研究原始响应与CPU采样留在忽略目录`logs/interaction-0.1.21/`。


## 2026-10-23 启动反馈与后台图标复用

- 编码前经agent-reach的GitHub/gh后端搜索Electron splashscreen，检查[trodi/electron-splashscreen](https://github.com/trodi/electron-splashscreen/blob/b2a144dcbfadf42d3532fb2300c266c87e9552e8/index.ts)（MIT）和[Electron BrowserWindow官方文档](https://github.com/electron/electron/blob/main/docs/api/browser-window.md)。复用独立轻量窗口、ready-to-show思路；该库的did-finish-load关闭条件、固定最短等待不适合原生接管，因此没有引入依赖，只适配现有desktopReady/管理状态。启动提示不抢焦点，真实就绪自动关闭，取消走原退出恢复。
- 检查[Electron多线程说明](https://github.com/electron/electron/blob/main/docs/tutorial/multithreading.md)：后台不使用Electron内建API。图标提取直接迁移本仓库原有win32-icons像素实现，保留alpha修复、JUMBO小角图回退、快捷方式资源索引及GDI/HICON清理；原接口保留为nativeImage适配器。复用现有shell-layout的Worker生命周期模式，增加图标批处理，主线程只编码nativeImage，失败不在主线程重跑同步FFI。
- 四边雾复用现有烘焙纹理和Pixi Texture frame，省略完全透明的中央区域，不更换素材或改写效果；像素覆盖检查通过，尚不能据此宣称帧率提高。
- 真正缺口：等待期间无反馈、同步Shell提取占住主线程、完全透明雾区域仍铺全屏；没有重写桌面引擎/经济/商城。无新增依赖。原始研究、计时与检查位于logs/startup-0.1.22，完整交付记录另列。
