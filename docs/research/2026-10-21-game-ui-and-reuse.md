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
