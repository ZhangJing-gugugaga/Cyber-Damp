# 2026-10-22 原生体验回归

范围：本机单屏1920×1080、125%缩放。0.1.11便携包使用预建隔离存档，未设置CD_QA/CD_NO_ATTACH。Windows-MCP Snapshot/Click/Move/Shortcut提供原生观察与输入，CDP仅记录状态和事件。完整Goal未完成。

| 项目 | 结果与证据范围 |
| --- | --- |
| 原生单击与清选 | 停留后点击图标出现选中框，移开仍保留；空白点击清选，已观察。瞬移后立刻点击可能早于穿透切换，暂不把该时序算通过。Ctrl多选已操作，截图不足以独立确认全部边界，保留待复测。 |
| 双击/层级 | 原生双击打开已知文件夹；Explorer盖住玩具，未运行未知可执行文件。 |
| 收拢入口与导航 | 默认一个蘑菇入口，点击展开；商城按钮打开同一管理窗的小铺页。快捷键打开管理窗，关闭管理窗后进程仍在，再次快捷键可显示。 |
| 商品反馈 | 原生领取免费铲子，页面出现成功反馈与“已拥有”；只读状态确认owned变化、金币未变。 |
| 干燥与清洗 | 原生干燥后湿度15%、霉斑保留；显式清洗后霉斑0、菇清除，有成功反馈。均只改隔离游戏存档。 |
| 暂停/隐藏 | 原生暂停后再隐藏，两个时点湿度/霉斑数值相同；隐藏恢复Explorer并显示已暂停。点击显示后可恢复。短时观察不替代全部休眠/唤醒验收。 |
| 启动回放 | 原生点击开始后见霉变桌面。只读console记录elapsedMs=4115.8、pausedMs=0，满足本次时长范围；不单凭日志宣称全程流畅和感官通过。 |
| 正常退出 | 原生点击退出，Explorer恢复可见；前后31项、DPI120，名称/坐标/图标及标签矩形无变化。此轮未计正常退出500ms。 |
| 强制终止恢复 | 复用现有恢复脚本，仅终止已挂载测试实例：94ms恢复，31项布局无变化。只覆盖本机这次终止，不推广到所有Explorer崩溃情况。 |

本地数值证据：`logs/experience-0.1.11/native-layout-compare.json`、`forced-exit.json`、`forced-layout-compare.json`、`native-opening-timing.json`、`paused-before.json`、`hidden-after.json`。原生截图以Windows-MCP本轮实际返回图为准；另行Pillow截图出现外层控制提示/镜像桌面，未用作原生场景验收证据，不据此判断连续回放。用户桌面截图及元数据不推送。

## 验证中发现并修复的源码问题

- 125%缩放下，成功反馈使小铺购买按钮跌出当前窗口。现复用现有flex/grid与滚动区域，保留操作区；最小560×500到默认窗口、含/不含反馈共8组独立窗口检查通过，按钮完整且未被覆盖。尚需在0.1.12正式包复测，不能算进0.1.11。
- 替身移动后选中框错误使用移动后的node坐标扣减固定Shell标签位置。现复用标签/命中已有的原始局部原点；独立真实FileSprite移动120×80后，选中局部边界保持91×88，移动后的图标仍命中。该检查不是原生拖拽验收。
- 打包改用electron-builder现成electronDist选项复用已安装Electron 44.8.0，避免再次下载同版运行时；不改应用运行时和依赖版本。

## 仍未完成

多屏/混合DPI硬件、多项拖动及其余工具/特殊菇组合、快捷键冲突、文件变更与休眠恢复、更多原图识别性、真实音频听感/麦克风、彩蛋原图随包来源及最终用户观察。有限Ctrl增选、单项拖动和下文幼菇流程不能推广成全部交互通过。当前性能保持用户认可，不追加长时性能门槛。

## 0.1.12补测

- 便携包70个生产构建文件哈希一致。EXE为113970853字节，SHA256：`2293c4e65bd8bb002615c9c24fdb54aafe55bc2d20aca540408359eb2ecc14d9`；旧0.1.11包保留。
- 实际加载包内app.asar，31项，旧隔离存档的铲子与清洗结果保持。原生开始回放，console实测4039.4ms。Windows-MCP完整Snapshot确认正常霉变场景；区域Screenshot出现不一致底图，未将其12张区域帧用作连续回放通过证据。
- 原生点击干燥产生反馈，再切小铺，购买区仍完整位于窗口底部。原始Windows-MCP完整Snapshot已直接落盘：`logs/experience-0.1.12/native-shop-snapshot.png`，未用外部ImageGrab替换。
- 正常退出增加只读`observe`探针；探针就绪后通过Windows-MCP点击已确认的退出按钮，首次观测按下到图标恢复103ms，低于500ms。证据：`logs/experience-0.1.12/native-normal-exit-v2.json`。最初带矩形过滤的探针因Node坐标虚拟化未捕获按下，未算通过；最终模式只观察高位按下状态，不自行发输入。

## 0.1.13补测

- 包内71个生产文件哈希一致，EXE为113971322字节，SHA256 `b691986719a45a048e66f4d4ff08ab28a259849a6923a00804be0aaaa1ace0ef`。实际加载app.asar，继续使用原有隔离测试存档。
- 原生进入偏好设置，关闭声音、选择低浓度；开始回放后Ctrl+Alt+M重新打开，开关和选项保持。只读快照确认sfx=false、veil=low、microphoneEnabled=false、microphoneState=disabled；场景面板计算背景rgba(220,229,222,0.82)。未开启真实麦克风，未验证音频听感。
- 原生先单选一个替身，再Ctrl增选第二个，移开鼠标后两个选中框同时可见。单个替身拖动120×80物理像素，局部选择框正确随动；只读位置增量为96×64CSS像素（125%缩放），随后已原生拖回。没有宣称多项拖动或整套键盘选择通过。
- 原生单击可见的成熟牡蛎菇，实际mushroom变为null，币从0变为5；未打开对应文件。仅覆盖此次成熟普通菇命中，不推广到特殊菇或全部生长阶段。
- 原生点击退出，测试应用进程结束，Explorer恢复。31项名称、位置及边界与先前原生基线一致。本次observe探针在人工点击前超过15秒期限，退出计时未成功，不引用旧版毫秒数作为0.1.13实测。
- 完整Windows-MCP Snapshot直接保存：`logs/experience-0.1.13/native-settings.png`、`native-ctrl-selection.png`、`native-drag.png`。状态与位置：`native-settings.json`、`native-drag-harvest.json`、`native-layout-compare.json`。截图和桌面元数据仅本地保留，不推送。

## 特殊菇补测与0.1.16

- 测试仅修改新建隔离目录中的游戏存档，复用已有存档结构，为两个已有对象设置shy/lava；未改真实文件或Shell位置，未使用CD_QA假桌面。人工设置的菇不是自然触发条件已通过的证据。所有输入为Windows-MCP；CDP只读状态、DOM位置及既有console日志。
- 0.1.13成熟特殊菇场景：无铲子时从管理页分别采摘，两者保留、币0，明确提示需先领取。原生小铺领取后，胆小菇可采摘；生气菇可剪落，再拖到展开面板金币栏售卖。证据：`logs/experience-0.1.13/specials-without-tool.json`、`specials-shy-actual.json`、`specials-lava-cut.json`、`lava-sale-weather.json`。
- 0.1.14/0.1.15验证暴露遗留8秒长满、可见命中成熟门槛及剪落显示强制成熟的问题；未把这些中间状态记为最终通过。0.1.15约半生长生气菇的原生点击/售卖已通，但剪落大小问题只在0.1.16修复。
- 0.1.16包71个生产构建文件哈希一致，113970937字节，SHA256 `423399e5cddbf852c83f22492152699690df39b28a4849737e87e0e0b66661db`；网上研究原图明确排除在包外。
- 从干净原生桌面启动，提示期间原生图标可见；实际点击开始。0.1.15曾有一次提示图中原生图标未显示，初始可见性未记录，未归因；此处只确认干净启动的0.1.16。本轮回放console为elapsedMs4044.7、pausedMs0，计时从首个可见动画帧开始，不含前期准备/挂载，也不能单独证明逐帧感官通过。
- 原生单击可见的约半生长生气菇，附着状态清除，生成剪落物；完整Snapshot确认剪落后保持小体积，未再强制长成成熟图。原生拖到可见金币栏后剪落列表为空，币0→143。再从管理页采摘未成熟胆小菇，状态清除、成功反馈，币143→349。源存档已拥有PVZ铲子；缺少铲子的原生路径由前述0.1.13场景覆盖，不伪称这次重新测了无铲子。
- 原生退出按钮前先启动只读observe探针并确认armed，Windows-MCP点击退出，图标恢复62ms，应用进程结束。前后31项、DPI120，名称、坐标、图标/标签矩形一致。本机单屏125%结果，不推广到其他硬件。未再重复强退性能测量。
- 本地证据：`logs/experience-0.1.16/young-ready.json`、`young-before-click.json`、`young-cut.json`、`young-sale.json`、`young-shy-harvest.json`、`opening-timing.json`、`native-normal-exit.json`、`native-layout-compare.json`；三个完整原生Snapshot为`native-young-before.png`、`native-young-cut.png`、`native-young-sale.png`。自然出菇、全部阶段/工具组合及完整UAT仍未完成。


## 0.1.17 商城 / HUD 美术优先增量

- 使用本机单屏1920×1080、125%缩放。实际运行release/win-unpacked/Cyber Damp.exe加载app.asar；CD_UAT仅隔离新游戏存档，不启用CD_QA/CD_NO_ATTACH。此处不冒称已从便携自解压入口运行。
- 使用项目cyber-damp-uat技能的Windows-MCP原生输入与完整Snapshot。启动助手采用隐藏进程窗口，随后原生Ctrl+Alt+M显示提示，原生点击开始。未重新测量启动时长。
- 原生蘑菇入口展开：余额售卖栏、商城/设置、天气和六工具位均可见。选择剪刀后，实际tool=scissors、唯一aria-pressed工具=scissors、当前说明=“剪刀：采摘蘑菇”。没有修改桌面文件或图标位置。
- 原生HUD小铺入口成功打开shop页；可见新搁板、纸签、等比旧电扇及新道具图形。原生选中铲子并领取，coins保持0、owned新增pvz-shovel、反馈成功；按钮显示已拥有。UI采用通用铲子图，不算PVZ原图替换完成。
- 原生点击退出，应用进程为0；前后Shell读取均31项、DPI120，method/dpi/origin/count/items完全一致。本轮未重新计时恢复毫秒数，也未重测强退。
- 本地原生证据logs/experience-0.1.17/native-hud.png、native-shop.png、native-purchase.png、native-before.json、native-after.json、native-layout-compare.json。截图含用户桌面，仅留忽略的本地logs。
- 独立界面检查logs/shop-art-0.1.17：两布局三页面无横向溢出，8组窗口尺寸/反馈组合的购买按钮可见；设置复用及离线静音检查通过。修复截图工具前生成的shop-art-before/after/reviewed图有空图或旧帧，不能用作视觉通过证据。
- 类型检查、构建、DOX、17文件冻结样片检查通过。本轮无领域行为修改，未机械重跑此前95项全量套件。
- 便携包release/Cyber Damp 0.1.17.exe，113979211字节，SHA256 2b58f59d1ae220c93612a0f5287fe6b812b2b820b8ed9a8834a61738d6494807。72个生产文件与dist一致，无研究原图。完整Goal及最终用户美术认可仍未完成。


## 0.1.20 原生窗口外壳

- 用户明确认可当前UI审美，指出难看的是原生弹窗壳；保留UI内容，只改管理窗frame/透明边缘/拖动/窗口按钮。复用Electron原生frame:false、transparent与app-region，不另造窗口引擎。透明窗按官方限制禁用系统边缘缩放及最大化，默认720×760，按主屏工作区收小。契约v1.8的收起/最小化仅接受管理窗发送方。
- 先停止被上次中断留下的旧0.1.19构建进程，原生退出旧测试实例，再构建新包；未重置用户源码或真实桌面。0.1.19未完成的HUD滚动溢出修正已包含于当前源码，不将旧包中间状态标为最终通过。
- 实际从release/Cyber Damp 0.1.20.exe便携入口运行，隔离游戏存档，正式桌面挂载，未启用CD_QA/CD_NO_ATTACH。Windows-MCP完整Snapshot确认无白色系统标题栏、四角切口透出后方内容、自有窗口按钮可见。当前本机单屏1920×1080、125%缩放，不推广到其他硬件。
- 原生点击启动后，场景ready=true。原生拖动标题空白区域，管理窗由screenX408移到486 DIP，y52保持；不是HTML内部滚动或模拟输入。不同DPI的整数取整不等同于严格100物理像素。
- 原生点击自有收起按钮：document.visibilityState=hidden，场景paused=false/hidden=false/ready=true；Ctrl+Alt+M重新打开。再原生点击最小化，Win32 FindWindow/IsIconic只读确认管理窗minimized=true；快捷键恢复后IsIconic=false，原生切换小铺成功。此处CDP只读，未代发窗口命令。
- 原生从设置点击退出整个程序，应用进程0，31项Shell的dpi/origin/count/items与启动前一致。本轮未重测毫秒恢复时间或强退，不引用旧版计时作为新包实测。
- 原生完整截图logs/experience-0.1.20/native-shell-shop.png；native-shell-shop-window.png仅裁切该图中的管理窗区域以免展示其他窗口，未重绘/修补UI。布局前后数据和比较同目录。八组窗口/反馈检查使用shell=1，十商品选择、重复消耗品及设置复用通过，证据logs/window-shell-0.1.20；这些仍是独立预览检查。
- 类型检查及95项测试通过，含新增窗口命令的发送方隔离、收起不暂停、最小化后恢复断言。DOX通过4指南、最大链11458字节。测试不能代替上述原生动作。
- 当前快速体验包497481112字节（约474.4MiB），SHA256 ac60f7fca66efdf9581d455062b2445c98f487e5ac6e2b8cb814b6c485eaff26；73个生产文件与dist一致，无研究原图。本包采用官方compression=store，常规压缩命令未改。完整Goal与新窗口壳最终感官确认仍未宣称完成。
