# 2026-10-18 / 19 修复与原生验收记录

> **2026-10-19 下一版设计更新：** [护理、经济与桌面融合设计](superpowers/specs/2026-10-19-care-and-desktop-design.md) 优先于本文的冲突条款。已确定平滑漫画风、独立管理窗口、清洁度收益/游戏内损坏、3–5 秒每次启动回放、55% 遮挡上限及严格保持原生图标大小与布局。旧版写实/核爆/蜗牛护理/固定六秒/网格重排等要求不再作为下一版目标。开发暂停；这些是待实现设计，本文历史实现与测试记录不代表新标准已通过。

状态：0.1.9便携包已生成并实启为29项、测试夹具0项，修复倾倒盒体外矩形蓝块，68/68机械检查及单列12种GPU边界组合通过。最终包正常退出13ms、强杀65ms恢复，24项包内资源/脚本与dist一致。源码原生拖动可见水面波动，110°倾倒后颗粒恢复并重新积水；清澈水流观感仍不足。沙漠干燥、水波、焦后真实打开等此前修复保留。声音/吹气按用户要求后置，积灰/褶皱质量、拧干及独立Computer Use截图/鼠标等仍待完成，不能标为终极UAT通过。

连续视频补齐此前只读采样初段空档的视觉证据，在约28fps录屏和起始抽帧中未观察到整屏黑白闪烁或HUD消失。明显水波阈值区间7.867秒不含微弱淡入淡出；只读采样在原生up后8.0383–8.0776秒观察停止，不证明精确8.000秒或更高帧率下每一帧均无异常。旧0.1.6便携包保持原哈希，不含壁纸/HUD扩展。

## 根因与修复

1. 多数 .lnk / 文件夹被 Electron 返回成通用白纸 / 磁盘图标；改用 Windows Shell PIDL 提取。扫描现已覆盖用户和公共桌面。
2. 原窗口在壁纸 WorkerW 中，前面的 SHELLDLL_DefView 吞掉真实鼠标事件；改为该桌面视图内部的子窗口，并在 SetParent 前设置 WS_CHILD。普通应用仍位于桌面之上。
3. 穿透后的 hover 恢复不能可靠依赖 Chromium 的转发鼠标消息；增加原生 DIP 光标探针，setIgnoreMouseEvents 仍仅在命中状态变化时调用。
4. 湿文件先识别拧干，吞掉正常短距离拖拽；改为立即跟随鼠标，同时累计三圈拧干手势。挂绳文件可取下。
5. 双击间隔写死 400ms；改为读取 Windows GetDoubleClickTime。只在真实打开成功后清除受潮。新增本地使用时间记录，避免旧文件刚打开就被 mtime 重新判为冷落。
6. 原雾效沿用白色底图 alpha=1，遮蔽整个壁纸；改为边缘 80px 的预乘半透明输出。新增按原图 alpha 采样的霉斑、水珠和卷曲材质。
7. 退出钩子无法覆盖 TerminateProcess；普通子进程监护又会随父进程终止。现通过 CREATE_BREAKAWAY_FROM_JOB / CREATE_NO_WINDOW 创建独立恢复进程，握手成功后才隐藏原生图标。
8. 热风原先提前累计焦化；现在同一目标连续受热超过 5 秒才增加焦化，松开或切换目标会重置连续曝光时间。文件名使用稳定的 1–2 个炭块字形，真实路径不变。洇水文字、共享脱水度、缩水/卷边与干叶点击声已接入。
9. 分类滴落改为仅在拎起或挂绳且湿度足够时每 2 秒发生；媒体图标降低饱和度，颜料滴可命中文档不透明像素并留下局部水渍。双击真实打开成功会清除水渍。
10. 文件夹原先直接使用目录 stat.size，Windows 下通常为 0；现只读取目录与文件元数据异步累计逻辑字节数，不读取文档内容，不遍历符号链接、junction 或其他 Windows reparse 目录。每目录上限 2 秒、50,000 条目、深度 64，桌面共享 3.5 秒截止时间；超限/无权限时记录已访问内容的下界，可能低估大型目录。
11. 麦克风吹气默认关闭，由设置中的明确操作启用；仅在本机分析低频 RMS 与自适应噪声底，输出平滑风力。没有录音、传输或原始音频持久化；关闭/卸载释放轨道和 AudioContext，拒绝权限或设备不可用时风力为 0。
12. “新建文件夹”自然生成胆小菇；同绳相邻图片与文档触发见手青，剪下后 0.5 秒氧化，吹熟后可免除生卖 8 秒致幻。特殊蘑菇已接入剪下、拖动、热风处理及拖至金币处出售。大文件毁灭菇的成长、倒计时、200px 弹坑、附近替身焦化与抛飞也已接入。
13. 断绳/爆炸后的文件落体改为两次可见反弹后落定，并保留散落姿态；领域验证覆盖边界与反弹次数，尚不能替代原生手感验收。
14. 原生产窗口在 ready-to-show 时提前显示，可能在装配完成前出现满屏白色。现首帧只解除绘制等待，窗口继续隐藏；renderer desktopReady、DefView 挂载、恢复监护就绪、原生图标交接成功后才 showInactive。第二实例和 DPI 重定位不能绕过启动可见性门控，开场时钟在交接成功后才推进。初始化失败记录错误并保留原生桌面。
15. 动态商店的按钮命中已接入桌面穿透判断；蘑菇命中按实际图像 alpha 取样，透明边缘不再吞掉邻近文件点击。焦化文件在重新装配时不再被普通开场播种重新长菇。修复已进入0.1.2；原生剪取/生卖及后续0.1.5烘熟售卖均已有证据。
16. 图标原先取32px再上采样；现在 PIDL + SYSICONINDEX 定位 SHIL_JUMBO / IImageList 图标源，保留旧提供者回退，并释放 COM/HICON/GDI 资源。回收站、文件夹、文本源图均为256px；7-Zip 源图画布256px但有效图案仅55×42，不冒称所有旧软件都有高清资源。
17. 生卖见手青时 uInputSize 在顶点/片元的隐式精度不一致，WebGL 链接失败，导致整个 Pixi 画布在致幻期间消失。将双方声明明确为 highp 后，原生重测可见水波和像素人，未再出现该错误；独立原生 WebGL2 链接检查也通过。
18. 原图集把见手青切口预先画蓝，干扰剪后氧化。内置 image_gen 新增 bolete-intact.png；附着状态为完整浅黄菌柄，剪下后的切面由采收控制器生成并渐变为蓝色。原生前后截图已观察到变化；后续0.1.8实测原生切口中心约430ms进入深蓝，约530ms接近最终稳定色，详见本轮计时节。
19. 任务栏弹出会遮住吸湿盒下半部；停放位现上移至共享底部边界上方。倾倒先达到110°再保持，增加连续水流及水量逐步减少；水只在回收站处倾倒。倒水时调整盒口位置，避免水流完全藏在盒体后。已有原生角度/水量证据，水流清澈程度和声音仍需感官核对。
20. 商店吸湿盒卡片的说明/步进器/购买按钮挤在同一行，说明被压成窄列；改为说明占一行、数量和购买占下一行。通用hover样式覆盖主按钮金色背景、导致深底深字的问题也已修复，原生截图显示名称/说明/按钮完整可读。
21. 快速原生拖拽的最后一次pointermove可被Chromium合并，旧onUp沿用上一帧图标位置。现文件和吸湿盒均使用松手坐标完成落点。0.15秒原生拖动文本文件后，实际(912,444) DIP与根据按下偏移和松手坐标推导值一致。
22. 生成的电扇原画原先整张横向缩放，底座跟着摇头变窄，静态叶片也未旋转。新fan-parts.png分离底座/空网罩/黄铜叶轮：底座固定，扇头透视摇动，叶轮在网罩后按时间旋转。原生16秒前后录像与96次只读采样验证底座宽恒为64DIP、高恒为55.801DIP，头部横向系数0.7648–1，叶轮角覆盖0.038–6.204rad；不把这个开发构建证据混同最终成品。
23. 3KB文本原先也按原始对数载荷增加绳体伸长，领域复现额外下垂42.94DIP，原生约40DIP。重力仍保留共享Fg公式；弹性伸长现扣除64KiB轻文件基线，再按剩余载荷增加，4.2GiB仍约增7%长度。新增定量失败回归修复后通过。原生最低点：空绳443.4597、3KB444.5434、追加4.2GiB554.9145DIP。
24. 旧白线从半径8画到13–17DIP，实际全部位于吸盘外，像四个白色括号。现在六组分叉白纹位于半径1.2–7.1DIP杯面内；绳体高频颤动作用于绘制副本，最大2DIP、锚点固定。原生84%载荷局部截图已确认杯面裂纹；精确80%阈值/2物理像素仍未测量。
25. 旧右吸盘一直跟随断绳端点，没有弹飞。现在断开后沿独立抛物线向外弹出，再离开画面；原生局部连续帧看到杯体离开绳端。落地槽位由72改120DIP，因为落地恢复92DIP标签且图标带旋转，72DIP会重叠文件名。四文件原生落定间隔120DIP，图案和标签清晰；超过一排容量的极端并发仍未验收。
26. 首次引导文字错误要求画两圈，实际门槛和用户标准均为三圈；文案现改为三圈。原生三圈拧干全程仍未完成。
27. 剪下的特殊蘑菇也存在快速拖拽最后一次pointermove被合并的问题，实机落点少28DIP。采收控制器现于pointerup补用真实松手位置，再判断售卖或启动落体；原生0.15秒重测expected/actual x均为1080.4073102736875DIP，误差0。该修复进入0.1.6源码；不能将0.1.5的烘熟录像当作此修复的成品验证。
28. 原生卖致幻只给Pixi舞台加滤镜，Windows壁纸和DOM HUD不在纹理中。现用IDesktopWallpaper读取当前系统壁纸、背景色及布局，在效果期间绘制副本，并以同一径向/交叉波场的低分辨率位移图处理背景和实时HUD；图标/绳沿用已验证的WebGL滤镜。效果结束移除HUD滤镜并隐藏副本，不改Windows设置、不截取其他窗口、不冻结HUD。主屏fill原生验证，center/tile/stretch/fit/span仅几何检查，未改用户壁纸逐种实测。该改动已打入0.1.7；旧0.1.6不含此扩展。

29. 旧湿文件在敦煌29%气候下趋近26.47%文件湿度，永远达不到旧25%干瘪门槛；干旱气候改用35%门槛，高湿挂绳仍保持25%。增加实际气候及34%干旱上界回归，先失败后通过，原生自然重测见本轮记录。

30. 吸湿盒水位着色器在旋转后的矩形滤镜范围内，直接把透明像素改成alpha0.55/0.12，产生盒外蓝块。现在透明像素保持透明，半透明像素的输出alpha不超过源alpha，颜色同步保持预乘。原生WebGL2的12种轮廓/水量/波动组合先失败后通过；实际拖动/倒水复测另见本轮记录。

## 已执行的检查

| 检查 | 结果与证据 |
| --- | --- |
| 类型检查 | renderer + main 通过 |
| 机械检查合计 | 当前源码**68/68**：world32、颜料3、特殊菌6、落体3、文件夹8、麦克风合成/模拟7、常量3、壁纸布局6。0.1.6便携包此前为61/61，0.1.4及更早包为60/60。不含真实吹气或完整原生交互验收 |
| 领域测试 | 当前world32/32；新增敦煌29.4096%/34%自然干燥与高湿挂绳门槛回归，另有3KB轻载定量回归，另含连续热风计时、松开重置、脱水恢复、炭块字形、“新建文件夹”菌种与旧存档兼容 |
| 专项回归 | `test-pigment.mjs` 3/3、`test-special-mushrooms.mjs` 6/6、`test-falling.mjs` 3/3、`test-folder-size.mjs` 8/8、`test-microphone-wind.mjs` 7/7；文件夹测试含真实约 2GB 文件、junction/循环、权限/消失错误、超时与延迟句柄释放 |
| 常量检查 | 3/3 |
| 生产构建 | renderer + main 类型/构建通过，最终0.1.9便携包已生成；包内renderer资源（含PNG与index.html）、main入口、Shell图标/壁纸脚本、IPC及preload共24项与dist逐字节一致，见logs/box-water-uat/final-019-packaged-assets.json。存在Vite配置格式与大chunk提示，完整UAT尚未通过 |
| 真实桌面扫描 | 此前稳定版 29 条目、23 种位图、0 张空图标、2 个桌面根目录；`scripts/check-desktop.cjs`。新增夹具后为 **34 = 29原有 + 5自建测试项**，不是用户文件丢失或凭空替换；`logs/material-uat/fixtures.json` 记录归属。此前33项快照早于lava夹具加入 |
| 原生窗口遮挡 | Windows-MCP 截图中浏览器完整遮挡桌面图标与 HUD；`logs/native-uat/uat-start-1.png` |
| 原生湿文件拖动 | Windows-MCP Move drag 成功；.claude 从 (4,114) 到 (512,290) DIP；`drag-after-1.png` 和只读快照 |
| 双击真实文件夹 | Windows-MCP Click clicks=2 后 main 日志记录打开 `E:/Desktop/.mimocode`，运行态霉变和蘑菇被清除；后续会话增加最近使用时间持久化 |
| 最近使用时间回归 | 再次原生双击后，扫描返回 lastOpenedAt 且原mtime不变；运行态持续fresh、湿度约0.15、霉变约0.006、蘑菇为空，未再次迅速受潮 |
| 普通退出恢复 | 本轮开发构建原生测得39/46/10/25ms，分别保留JSON；最终便携包结果见本节末尾，不能把开发计时混同成品 |
| 强杀恢复 | 最终哈希的0.1.9便携包 **65ms**，`logs/native-uat/final-019-forced-restore.json`，restored=true/pass=true；此前0.1.8为59ms、0.1.7为68ms、0.1.6为57ms、0.1.5为82ms、0.1.4为65ms、0.1.3为68ms、0.1.2最终包74ms，0.1.1为56ms |
| 本轮真实热风操作 | Windows-MCP 实际按住同一测试纸文件 6.8 秒；`logs/native-uat/material-guarded-charred-1.png`，只读运行态 char≈0.602、state=burnt。证明该输入链路与状态变化，不代表烟雾、像素、首次焦化时刻及焦后打开均已验收 |
| 本轮连续启动录像 | 新录像 `logs/material-uat/opening-complete-native.mp4` 约40秒：约11秒前为原生桌面，之后完整看到约6秒的干净→雾→霉变→蘑菇→解锁，未观察到白屏闪现；像素质量与精确分段尚未全部验收。旧25秒 `opening-native-new.mp4` 仅有约5.3秒可见开场，不能证明解锁；旧 `opening-clean.png` 19.3秒帧实为原生桌面 |
| 胆小菇原生近/远操作 | `logs/native-uat/shy-hide-native-1.png` 与 `shy-emerged-native-1.png`：近指针时藏至约2px紫色尖，移远等待3秒后重新出现。尚未测量120px精确触发边界和2.000秒恢复时刻 |
| 原生拉绳与挂图 | 实际 Down/Up 完成 r-001，初始过渡见 `logs/native-uat/rope-drawn-once-1.png`；稳定深U见 `media-short-hung-1.png`，图像挂绳见 `media-pinned-native-1.png`。只读绳快照包含自建PNG和parchment；不能用初始过渡帧代替最终绳形验收 |
| 自然见手青及采收 | `logs/native-uat/portable-012-before-cut-1.png` 显示PNG/文档相邻后自然成熟见手青；切取后只读harvest含独立物体、coins不变，拖至金币后265→385。修复滤镜后再次385→505，见fixed-after-sale-1.png。早期切取尝试被保护中止或实际仍选热风，不计剪下通过 |
| 毁灭菇原生生命周期 | 自建1GiB测试文件记录于夹具清单；`logs/material-uat/lava-native.mp4` 约50秒含完整倒计时、爆炸、可见弹坑、周围图标焦化和抛飞。只读运行态中lava及附近paper为char=0.9、burnt、mushroom=null，最终落定于y=694；200px精确直径、反弹次数和爆炸声仍待独立核对 |
| 生产模式日志 | 本轮原生启动/快照未观察到新 shader / tick / 资源加载错误；早期 shader 精度不一致已修复。此项不代表未触发的特殊效果已运行 |

恢复计时通过 Win32 直接测量；属于原生集成测试，不冒充鼠标点击退出按钮的验收。

用户已明确选择“先完成其他测试”，将真实麦克风吹气与试听留到后续；当前麦克风保持关闭。合成/模拟音频测试和代码存在不计为真实声音或硬件验收。

## 用户 UAT 逐项状态

| 项目 | 状态 |
| --- | --- |
| 普通窗口遮挡玩具 | 此前核心场景通过，浏览器实机截图；本轮40秒完整启动录像未观察到白屏，加载时仍见原生桌面 |
| 用户 + 公共桌面 + 回收站数量 | 多轮材质/承重/特殊菌使用5项或4项自建桌面夹具；均已清理，最终0.1.7成品实启为29项、测试夹具0项 |
| 原生图标 / 白字阴影 / 完全不透明 | 已改为 Shell 256px 源图；回收站/文件夹/文本原图有效尺寸均超过150px，34项扫描25种位图、零空图。100次提取前后GDI/USER均为42/18。旧软件可能只提供小图，白字/阴影及逐图感官仍需核对 |
| 拖动跟手 / 双击打开 | 已用 Windows-MCP 实机验证；首击进入穿透区域的极端时序仍需补测 |
| 普通退出 / 强杀恢复 <0.5s | 最终0.1.9便携包正常退出13ms、强杀65ms通过；这是原生可见性计时，不冒充鼠标点退出按钮 |
| 原生桌面坐标与右键恢复 | 未写入坐标；便携版运行时空白处右键出现真实 Explorer 菜单，`desktop-context-menu-1.png` |
| 0–6 秒开场 / 湿度计光标 | 40秒原生录像已覆盖完整约6秒开场到解锁，含湿度计光标、干净/雾/霉变/长菇各阶段；精确秒段和各像素红线仍部分待核对，不作整行无条件PASS |
| 写实水珠 / 洇水文字 | 水珠与白字洇水重影已接入，完整开场录像可查；数量、滑落、高光/暗影与文字像素仍待细核 |
| 湿纸形变 / 图标 alpha 内正片叠底霉斑 | 已接入材质，需完成像素级视觉验收 |
| 分类滴落 / 标点积灰 / 颜料染色 | 原生按住自建PNG约7秒，下方自建文本图标出现紫色水渍。本轮0.1.5原生按住湿文本约7.018秒，底部留下三处黑标点，扫帚清除；ink-ash/ink-after-sweep原生截图同一区域暗像素11→0。录像估计落底间隔约1.95/2.00秒，不能代替精确发射时刻；黑痕很小且分散，尚未确认“一小撮黑灰”的感官质量。饱和度30%像素计量仍缺，不整行PASS |
| 压缩包鼓胀 | 0.1.7自建ZIP开场原生录像及archive-opening-contact.png观察到两侧鼓出、拉链弯曲；形变量/整体写实质量尚未量测，不整行PASS |
| 三圈拧干 / 螺旋 / 水珠 / 标签15度 | 已接入输入与材质，未原生全程验收 |
| 暴晒缩水20% / 泛黄褶皱 / 干叶声 | 原生迁往敦煌29%后复现旧湿文件dryness永远0，已修复门槛并加先失败后通过回归。源码原生自然演化至dryness1，泛黄/卷边可见；与干净开场帧逐行可见中部宽比中位数0.80。视频压缩/卷边alpha限制精度，现有波状褶皱是否达到旧羊皮纸质感及干叶声仍未验收，不整行PASS |
| 超过5秒焦化 / 焦黑卷边 / 文字炭块 | 本轮真实按住7.011秒，只读首次正char在down+5.0118秒，最终char≈0.602/burnt；原生char-contact可见边角加深和文件名黑块。随后真实双击在默认记事本打开原文本，采样清除char/mold/mushroom，关闭后的原生截图恢复原名。悬停蓝光遮挡部分烟/边缘，首次可见焦化、白烟/锯齿卷边质量及精确边界仍未全验收 |
| 绳子平滑纹理 / 25px夹子虚影 / 木夹咬合 | 原生Down/Up拉出r-001，PNG和parchment实际挂上，稳定深U和夹住图像有截图；25px准确虚影边界、木夹张合/5px咬合与声音仍待细验 |
| 大小重量 / 滑动零重叠 | 原生3KB文本仅额外压低1.084DIP，追加实际计重4.2GiB文件夹后再加深约110.37DIP。三个文件实际滑到低处，挂点约72DIP间隔，rope-fixed-three-clear截图图案/标签可见。文件夹8/8与新增轻载定量回归通过；碰撞声未试听，目录超限仍可能低估 |
| 电扇摆动 / 麦克风吹气 | 0.1.3原生购买电扇385→135币，fan-swing-native-013.mp4观察到挂绳图标左右摆动。修复整张缩放/静叶片后，开发构建fan-fixed-native.mp4/contact.png与pose.json观察固定底座、独立扇头及叶轮；最终0.1.4的final-014-fan-native.mp4/contact.png及96次pose采样再次核对。轻重幅度/频率比较仍待测。成品设置截图确认麦克风关，7/7仅合成/模拟；按用户要求真实吹气与试听后置 |
| 80%白裂纹和绳抖 / 100%崩断 / 无文字框 | 原生约84%载荷出现杯面白色分叉裂纹及绳颤动，未出现承重文字警告；追加1GiB达约104%后断绳，右吸盘独立向外弹飞，四图标坠落/回弹后落定。fixed-overload-native.mp4及局部连续帧；只读重物轨迹有两次回升（采样最低约634.69、682.40DIP；落定694DIP），四个最终槽位间隔120DIP。精确80%/2物理像素、声音及极端多文件容量仍未验收，不作整行无条件PASS |
| 胆小菇120px / 2px藏头 / 2秒探头 | 自建“新建文件夹”自然长菇；原生近/远截图已观察到约2px藏头和移远等3秒后探头。120px准确边界、受惊一颤及2.000秒起始时刻未量测 |
| 见手青邻接生成 / 0.5秒氧化 / 生卖致幻8秒 | 原生邻接自然成熟、剪下不立即入账、生卖加120并出现水波/像素人，以及0.1.5烘熟后售卖无幻觉均有记录。本轮0.1.8成品2389原始帧/39.99秒的局部录像与原生事件时钟对齐：切口中心在411.2–429.7ms跨入深蓝阈值，494.9ms原始帧肉眼已深蓝；约529.6ms才接近最终稳定颜色。可见深蓝的半秒子项本次观察达标，不声称全切口每像素在500ms前到最终色。生卖壁纸/HUD/图标扭曲和恢复已实测，连续视频明显水波7.867秒不含淡入淡出，只读停止8.0383–8.0776秒；精确8.000秒等未全部满足，不作整行PASS |
| 毁灭菇大文件 / 倒计时 / 200px弹坑 / 震飞 | 自建1GiB文件的50秒原生录像已覆盖完整倒计时、爆炸、弹坑、附近焦化/抛飞，运行态char=0.9/burnt后落定。精确200px、两次反弹与声音仍待核对 |
| 吸湿盒颗粒 / 水位晃动 / 拖至回收站110度倒水 | 已原生购买、自然满水、拖动、倾倒和重新吸湿。本轮源码修复透明像素被涂成矩形蓝块，12种GPU轮廓/水量/波动回归通过。slosh-aligned-contact显示实际拖动时水面波峰/波谷移动；pour/refill录像显示倾110°、首个倒后fill0.0002、末尾0.5482，白颗粒恢复并重新涨水。盒外矩形已消除，但可见水流很短，清澈度/流入观感及声音仍未达整行验收，不作整行PASS |
| 独立 computer-use 后端 | @oai/sky已读取自建空白记事本UIA树，并实际用Alt+F4关闭该窗口，list_windows确认消失；computer-use-notepad-native.json。窗口完整遮住玩具的MCP截图与键盘关闭后截图均保留。WGC仍报FrameArrived timed out，坐标点击报geometry unavailable，完整独立截图/鼠标链路未通过 |

## 原生测试环境限制

### 壁纸/HUD水波源码验证与0.1.7成品

补充连续录像（下一轮源码测试）：`logs/ripple-uat/raw-sale-continuous.mp4`为45秒、原始1259帧（约28fps）的GDI桌面录屏；Windows-MCP真实拖卖和两张效果截图成功，末尾Wait被CONTROL_UNAVAILABLE中止，不计通过。录屏/只读采样独立运行并覆盖自然恢复，未因该失败而重放输入。

`continuous-video-summary.json`和`continuous-onset-contact.png`记录检查：1350个30fps重采样帧中无超过95%画面近白或近黑的帧，天气牌区域暗像素占比最低0.513；已人工查看效果起始约1.7秒的连续抽帧，未发现整屏黑白闪烁或HUD消失。背景ROI平均差大于5的明显水波从视频16.967至24.833秒（7.867秒），微弱淡入淡出不包含在这个阈值区间中；阈值2会把指针/悬停/游走蜗牛造成的弱变化也算入，不能用该跨度宣称致幻持续24秒。结束后视频ROI平均差0.714属于有损编码，原生PNG逐像素恢复证据另见下文。

配套`raw-sale-video-pose.json`与`continuous-sampler-summary.json`再次记录0→120、全程HUD滤镜、自然停止和还原；停止在原生up后8.0383–8.0776秒之间。首次活动只读采样仍晚1078.5ms，因此视频补齐了该时间段的视觉观察，但这些数据不证明精确8.000秒或更高帧率下每一帧均无异常。source正常退出恢复13ms，四项a504627c夹具经哈希/空目录核对清理。

录屏工具为uv隔离环境的imageio-ffmpeg0.6.0所带FFmpeg7.1，实际路径保存在`logs/ripple-uat/ffmpeg-path.txt`；只作原生观察/分析，未发送桌面输入。分析脚本为`scripts/analyze-ripple-video.py`。

原生Windows-MCP截图：`ripple-visible-baseline-1.png`、`ripple-after-cut-1.png`、`ripple-active-one-1.png`、`ripple-active-two-1.png`、`ripple-after-finish-1.png`。实际拉绳、挂owned PNG+文档、自然长出、剪取并拖卖，金币0→120。两张效果截图中山体、海浪、天气牌、金币栏和图标均被扭曲，半透明像素人可见；最后恢复。

`logs/ripple-uat/native-pixel-comparison.json`比较相同原生区域：壁纸ROI(1250,350,250,140)活动时32630/31806像素通道差大于8，停止后全部35000像素与剪前完全一致；HUD ROI(760,20,410,70)活动时10967/11695像素明显变化，停止后大于8的变化为0（均值差0.261，未冒称逐字节相同）。旧`fixed-before-cut`/`fixed-after-sale`壁纸同区差为0，`legacy-wallpaper-regression.json`保留修复前失败证据。

`raw-sale-pose.json`917次只读采样和`raw-sale-summary.json`记录入账、HUD滤镜及底图显隐；首次活动采样晚于原生up约894.8ms，上一采样间隔919.8ms，不能据此声称无首帧停顿/闪烁。首次正常采样在up后8.095秒，上一个活动采样在8.055秒；这是采样边界，非精确停止帧。此轮使用截图序列而非完整连续视频。

`scripts/check-wallpaper.cjs`实际读取系统选定1920×1200图像、fill布局、1920×1080主屏和1.25缩放，通过结果为`wallpaper-native.json`。COM对象在本机由Explorer进程外提供，激活需允许本地服务器；LPWSTR用`koffi.decode.string16`读取，字符串和接口均释放。该链路首次调试的激活/解码问题已修复后才启动生产桌面测试。代码未调用设置壁纸接口。

第一轮源码正常退出恢复19ms（`ripple-source-normal-restore.json`），四项19183813夹具在退出后经哈希/空目录核对清理。之后补充连续视频并制作0.1.7便携版；旧0.1.6不受替换。真实吹气/试听仍后置。

**最终0.1.7（2026-10-19）**：`release/Cyber Damp 0.1.7.exe`，113787815字节，SHA256 `D24AE477B2C60E5B9D3CB1D9C39C92E1119CAF618BB508060BA4BECEF329C5A0`。实际IPC版本0.1.7、unlocked、29项、fixtures=0、ropes=[]，壁纸IPC读到fill/1920×1200且副本已准备但display=none；`final-portable-017-state.txt`/`final-portable-017-ready-state.txt`。实际检查的成品画面为`logs/native-uat/final-017-forced-ready-clean-desktop-1.png`；第一次`final-017-clean-desktop-1.png`仍是加载期间的原生桌面，不计装配成功图。成品正常退出15ms、强杀68ms，见`final-017-normal-restore.json`/`final-017-forced-restore.json`。包内24项资源与脚本匹配（含preload/IPC/新壁纸代码），源码录屏与成品字节核对不替代最终包每项玩法重测。`final-017-cleanup.json`确认夹具0、无Cyber Damp/Electron/FFmpeg测试进程，旧0.1.6哈希未变。

Windows-MCP 0.8.8 多次返回 USER_CONTROL、CONTROL_UNAVAILABLE、CONTROL_PREEMPTED，部分调用出现 AI control indicator stopping 或 Previous screenshot flash did not close。上游 [问题 #465](https://github.com/CursorTouch/Windows-MCP/issues/465) 报告了指示器心跳停顿后误报 USER_CONTROL / 持续 CONTROL_UNAVAILABLE 的情况，与本次部分症状相符；仅凭该代码不能断定用户正在移动鼠标。驱动仍遇错即停，不绕过控制权保护，也识别 is_error=false 但文本报告截图失败的情况。成功执行的6.8秒热风与失败/中断的后续动作分别记录，不把整段脚本算作通过。

独立 Computer Use 的 node_repl 已恢复，取代此前 kernel assets 的启动错误。资源管理器WGC失败后，本轮改用新建空白记事本取得UIA树；WGC仍报 `FrameArrived timed out: timed out waiting on channel`，点击关闭按钮报 `coordinate input geometry is unavailable`。重新观察焦点后，原生 `Alt_L+F4` 成功关闭未编辑的自建窗口，刷新列表确认该id消失。桌面附着子窗口未在可选返回窗口中。键盘子链路已有原生证据，完整独立截图/鼠标玩法仍未通过，目标继续进行。

## 项目级能力与参考

- `.codex/config.toml`：固定 Windows-MCP 0.8.8，stdio，仅项目配置，无全局服务/计划任务。
- `.agents/skills/cyber-damp-uat/SKILL.md`：生产桌面 native UAT 流程和证据纪律。
- [CursorTouch/Windows-MCP](https://github.com/CursorTouch/Windows-MCP)：原生截图/鼠标/键盘，实际以其 MCP 协议调用。
- [pixijs/filters](https://github.com/pixijs/filters)：官方兼容矩阵 Pixi 8 对应 Filters 6；已安装并使用 Twist/BulgePinch。
- [Lively](https://github.com/lively-community/lively)：桌面宿主成熟参考，本次没有引入整个壁纸框架。
- [Microsoft SetParent](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-setparent)：按其文档在重设父窗口前设置 WS_CHILD。
- [Microsoft SHGetImageList](https://learn.microsoft.com/en-us/windows/win32/api/shellapi/nf-shellapi-shgetimagelist)：JUMBO为256px；使用IImageList并按文档释放返回图标。

## 生成资产

内置 image_gen 生成两张透明图集、完整菌柄见手青及电扇分层图集，位于 `src/renderer/assets/`；提示词见 `PROVENANCE.json`、`bolete-intact.provenance.json` 和 `fan-parts.provenance.json`。新增素材通过引用原图集生成，菌柄不预画蓝色；电扇分为底座、无叶片网罩和三叶黄铜叶轮。剪下蓝色切面、生卖致幻、烘熟售卖及电扇独立运动已有原生证据；像素/时间精确阈值、声音仍未全验收。

## 本轮墨迹与烘熟售卖证据（0.1.5成品）

`logs/ink-cook-uat/ink-held-native.mp4`及`logs/native-uat/ink-ash-1.png`、`ink-after-sweep-1.png`保留实际按住/落灰/扫除。原生截图局部计数见`ink-sweep-native-pixel-count.json`；暗像素阈值为各RGB通道均小于150，同一区域(355,1015,180,35)。约2秒的落底间隔由录像20fps采样估计，未冒称精确发射计时。

`bolete-cut-native.mp4`、`cooked-heat-native.mp4`、`cooked-sale-native.mp4`记录自然长出、剪下、掉落、热风烘熟及拖至金币的全链路。配套只读`cut-pose.json`、`cooked-heat-pose.json`、`cooked-sale-pose.json`和`cooked-sale-summary.json`支持状态/入账；`cooked-sale-contact.png`检查售后画面。没有通过调试写状态或模拟输入强制成熟/烘熟/入账。

快速拖拽缺陷的修复前记录见`harvest-drag-before.json`，源码修复后的原生截图见`harvest-fixed-cut-floor-1.png`，只读比较见`harvest-drag-fixed.json`。本轮4项自建d86c5e09夹具已在退出后经哈希/空目录核对清理，见`logs/material-uat/fixtures.json`；旧清单归档为`fixtures-2ca1f2b2-cleaned.json`。麦克风全程未启用。

**0.1.6（2026-10-19）**：`release/Cyber Damp 0.1.6.exe`，113786838字节，SHA256 `41170BBC7CAC61B35889D4492D1AC8A78EB9469B0BC2614BE2DA4DABCEA1A944`。包含采收拖拽松手落点修复；包内21项资源/脚本与dist逐字节相同。实际IPC版本0.1.6、unlocked、29项、fixtures=0、ropes=[]；`logs/ink-cook-uat/final-portable-016-ready-state.txt`及`logs/native-uat/final-016-ready-clean-desktop-1.png`。第一次`final-016-clean-desktop-1.png`仍是加载期间的原生桌面，不计装配成功截图。最终正常退出17ms、强杀57ms，见`final-016-normal-restore.json`/`final-016-forced-restore.json`；均为Win32可见性计时。旧0.1.5便携包哈希保持507A9C557581DB12BDBBD318E3BB5709B8805F828D420862573835C9B05704DF。源码原生拖拽回归与0.1.5烘熟录像各自独立记录，没有冒充0.1.6成品所有玩法均重测。

收尾检查`logs/ink-cook-uat/final-016-cleanup.json`确认4项夹具均已移除、无Cyber Damp/Electron/ffmpeg测试进程遗留，新旧成品哈希与上述记录相符。类型检查及git diff --check通过。

## 便携版

0.1.5最终检查确认无Cyber Damp/Electron/ffmpeg测试进程遗留，旧0.1.4便携包SHA256仍为F1326A713308C6BA033B553002D47F83BD57AE8C502CF107887A85357BEDCFCA。

**0.1.5（2026-10-19）**：`release/Cyber Damp 0.1.5.exe`，113788723字节，SHA256 `507A9C557581DB12BDBBD318E3BB5709B8805F828D420862573835C9B05704DF`。包含轻载弹性、杯面裂纹/高频颤动、杯体独立弹飞、120DIP落地间距及三圈引导修复。实际IPC版本0.1.5、unlocked、29项、fixtures=0、无残留测试绳；`logs/rope-uat/final-portable-015-state.txt`及`logs/native-uat/final-015-clean-desktop-1.png`。包内20项渲染资源和main入口/Shell脚本与dist逐字节一致；`final-015-packaged-assets.json`。成品正常退出13ms、强杀82ms，见`logs/native-uat/final-015-normal-restore.json`及`final-015-forced-restore.json`。最终进程检查和旧便携包哈希复核另记。

本轮4个自建桌面条目（4个文件，其中1个在测试文件夹内）已按哈希验证后清理，随后移除空文件夹；`logs/rope-uat/fixtures.json`。未读用户原有文档内容，未写原生图标位置。0.1.4原生失败基线与随后生产桌面开发构建重测分别保留，不将开发录像混同最终便携包。核心证据：`rope-fixed-empty/light/heavy/three-clear/overload-landed-1.png`、`fixed-heavy-hang-native.mp4`、`fixed-warn-hook-detail.png`、`fixed-overload-native.mp4`及杯体/坠落局部连续帧，均位于native-uat或rope-uat目录。重物只读轨迹保留`fixed-heavy-fall-trajectory.json`：两次回升后约0.96s落定。精确阈值/物理像素及声音未完成，完整UAT仍未通过。

0.1.4最终退出检查后，未发现Cyber Damp、Electron或ffmpeg测试进程遗留；0.1.3/0.1.2文件哈希复核保持不变。所有自建桌面夹具已清理。

**0.1.4（2026-10-19）**：`release/Cyber Damp 0.1.4.exe`，113785570字节，SHA256 `F1326A713308C6BA033B553002D47F83BD57AE8C502CF107887A85357BEDCFCA`。新增独立底座/网罩/叶轮的fan-parts.png和动画，保留0.1.3修复。实际IPC回报0.1.4、29项、unlocked、fixtures=0；`logs/material-uat/final-portable-014-state.txt`及`logs/native-uat/final-014-clean-desktop-1.png`。实际成品8秒原生录像观察电扇独立运动，96次只读采样底座宽64、高55.801DIP不变。Windows-MCP实际打开设置，截图`final-014-settings-1.png`中麦克风为关。正常退出19ms、强杀65ms，见`final-014-normal-restore.json`及`final-014-forced-restore.json`。包内20项资源/脚本逐字节匹配；测试结束后检查进程。完整UAT仍未通过。

**0.1.3（2026-10-19）**：`release/Cyber Damp 0.1.3.exe`，112574984字节，SHA256 `DA64BA59274D502CADFF02DC522F196415BEB3C637DE8883D22E622244547C14`。包含本轮吸湿盒停放/倾倒、水流、商店排版与拖拽松手落点修复。实际启动IPC回报0.1.3、29项、unlocked、fixtures=0；`logs/material-uat/final-portable-013-state.txt`及`final-013-clean-desktop-1.png`。最终正常退出恢复19ms、强杀恢复68ms，分别见`final-013-normal-restore.json`和`final-013-forced-restore.json`；测后确认无Cyber Damp/Electron/ffmpeg测试进程遗留。包内全部renderer JS/CSS及Shell高清图标脚本与dist逐字节一致。0.1.2文件哈希保持下述记录。完整UAT仍未通过。

本轮4项自建夹具的清理记录在fixtures.json；上一轮5项清单保存在fixtures-d97d80d6-cleaned.json，均经哈希/空目录核对后移除。新原生证据包括：household-fixed-shop-bottom、household-fixed-box-new、pigment-after-drips、drag-endpoint-after；box-final-pose-summary.json记录110°及清空后的重新积水；computer-use-notepad-native.json记录原生键盘成功及截图/点击失败。所有感官观察均区分开发构建和最终成品，不把机械检查计入听觉验收。

此前 **0.1.2** 包含 highp 修复及完整菌柄新素材；与包内对应JS/PNG逐字节核对一致。文件为 `release/Cyber Damp 0.1.2.exe`，112577504字节，SHA256 `140E638C7F4292028D816D6EC39895C85E9F48328303492B646F42A638129624`。此前同版本包已实启、扫描34项、原生剪下/拖卖入账、强杀82ms恢复；最终清理桌面后的启动与退出结果另见本节后续记录，不能将旧包录像当成最终哈希的所有验收。

最终哈希成品已实启，版本0.1.2，开场解锁、扫描 **29项**，无测试夹具残留；`logs/material-uat/final-portable-012-state.txt` 与 `logs/native-uat/final-012-clean-desktop-1.png`。5项自建夹具经SHA256/空目录核对后已移除，清理时间记录于fixtures.json；不递归删除、不改动原有文档与原生图标坐标。最终正常退出恢复 **15ms**、强杀恢复 **74ms**，分别见final-012-normal-exit.json和final-012-forced-exit.json。收尾确认无Electron/ffmpeg测试进程遗留。

额外专项证据：`logs/icon-uat/source-dimensions.json`、`resources.json`、`desktop-scan.out.log`；原生WebGL2回归 `logs/material-uat/hallucination-shader-link.json` 为linked=true/log为空；致幻修复录像 `fixed-sale-native.mp4`、无shader错误的 `fixed-sale-events.jsonl`；完整菌柄剪前/剪后截图 `intact-before-cut-1.png` / `intact-after-cut-1.png` 及标称60fps、实际848帧/29.98秒（约28fps）的局部录像 `intact-cut-native.mp4`。旧录像不据标称帧率推算0.500秒；本轮另录实际约60fps并按原始PTS计量。

以下是此前稳定便携版的记录。**该0.1.1文件未改动，不包含本轮开发构建中的材质补全、颜料、麦克风、特殊菌/采收、落体、文件夹重量及启动交接修复。** 当前 dist 与该便携包不可混同；本轮验收完成后还需重新打包、启动并复核。

- 文件：`release/Cyber Damp 0.1.1.exe`（111092229 字节）。
- SHA256：`37CDF6E617A7FCD62FDFF38739FC3C218D5F0A56EF5E04FDB6361480D17EBFA5`。
- 实际启动该便携版，IPC 版本返回0.1.1，扫描29项、空图标0、装配29项；Windows-MCP 原生截图见 `portable-native-1.png`。
- 便携版设置按钮的真实鼠标点击成功，DOM 面板可见；截图步骤曾被 MCP 控制权保护中止。
- 最终便携版正常退出恢复10ms，真实桌面右键菜单通过；`final-portable.txt` 记录最终构建0.1.1、29项、空图标0、最近使用文件保持fresh。


## 本轮压缩包、沙漠干燥及焦后打开

0.1.7的真实迁移按钮切到敦煌（2026-10-19，ambient=0.294096、HUD29%）。旧湿文件自然趋近0.2646864，原先固定0.25干瘪门槛永远达不到，dryness保持0。`desert-before-test.log`保留同条件失败回归；源码在干旱气候放宽至0.35门槛，并保留高湿挂绳0.25条件，`desert-after-tests.log`记录68/68。未写游戏状态或调整时间强制触发。

`archive-opening-native.mp4`及已检查的`archive-opening-contact.png`显示自建ZIP从平直边逐渐鼓起、拉链弯曲。`desiccation-native.mp4`记录旧版无法干瘪；`desiccation-fixed-native.mp4`及`physiology-fixed-dry-1.png`为源码修复后自然变干。`dry-native-size.json`在纸文件中部逐行比较可见宽度：相对已受潮下垂的图为0.8421，相对干净开场视频帧为0.80；不使用受蘑菇根部污染的整体包围盒计量。视频压缩和卷边alpha意味着它不能证明精确缩放矩阵或每个像素均减少20%。

`char-native.mp4`、`char-contact.png`、`char-pose.json`及`char-summary.json`记录真实按住7.011秒与连续焦化。首次采到char>0在down+5.0118秒；这只是采样时刻，不冒充精确首次可见焦点。原生最后截图中边角变黑、标签有炭块，悬停发光和蘑菇遮挡妨碍部分烟雾/边缘质量判断。

`physiology-open-result-1.png`显示默认记事本打开自建`Cyber Damp UAT-01522521-paper.txt`。`open-summary.json`在相邻45.6ms采样间观察到焦化/霉变等归零，并非从双击到打开的耗时。`physiology-after-open-1.png`显示关闭自建记事本后标签恢复、蘑菇消失；沙漠环境随后会再次增加干瘪度。真实文件路径/内容和mtime未改写，清理哈希核对仍通过。源码正常退出恢复20ms，见`logs/native-uat/physiology-fixed-normal-restore.json`；此前0.1.7湿态实例退出10ms。

本轮四项01522521自建桌面夹具均已核对哈希/空目录后清理，manifest记录cleanedAt。以上新证据位于`logs/physiology-uat/`与`logs/native-uat/physiology-*`，最终0.1.8成品核对另记。麦克风保持关闭，声音继续按用户要求后置。


## 最终便携版0.1.8

`release/Cyber Damp 0.1.8.exe`：113791355字节，SHA256 `E77A6DB9851608A7A75BD34EF2B6089C2DD29E7D25A92324D6C7A35B4452CA49`。本版加入沙漠干瘪门槛修复；24项包内资源/脚本逐字节匹配当前dist，见`logs/physiology-uat/final-018-packaged-assets.json`。实际IPC返回0.1.8、unlocked、29条目、fixtures=[]、ropes=[]，非QA/NO_ATTACH；`final-018-state.txt`及已检查的原生`final-018-current-desktop-1.png`。原生设置截图`final-018-settings-1.png`确认麦克风关闭。

在此最终包中真实点击迁移按钮至敦煌29%，未打开原有文件或更改其内容/坐标。26个原湿条目从humidity约0.9/dryness0，39.23秒观察时dryness约0.5511，90.85秒最终观察全部dryness1。此处elapsed从迁移前只读观察开始，包含工具启动与操作等待，不冒充干燥精确时长。`final-018-desert-summary.json`、`final-018-desert-progress-1.png`及`final-018-desert-dry-1.png`分别保留状态与原生画面；这补充了成品上的实际功能回归。

最终包正常退出恢复13ms、重启后强杀恢复59ms；`logs/native-uat/final-018-normal-restore.json`与`final-018-forced-restore.json`。重启实际IPC再次确认0.1.8/29项/无夹具/无绳，并检查`final-018-forced-desktop-1.png`显示已装配桌面。计时为Win32可见性检查，不等同原生鼠标退出按钮测试。

`final-018-cleanup.json`确认四项自建夹具全部移除，无Cyber Damp/Electron/ffmpeg测试进程遗留；旧0.1.7便携包哈希保持D24AE477B2C60E5B9D3CB1D9C39C92E1119CAF618BB508060BA4BECEF329C5A0。类型检查和diff空白检查通过。独立Computer Use刷新list_apps仍未返回生产桌面子窗口，`logs/native-uat/computer-use-018-targetability.json`记录未发送输入；不把Windows-MCP成功算作独立鼠标通过。完整终极UAT继续未通过。


## 0.1.8原生切口氧化计时

本次重新创建95530a05自建PNG、纸文件、parchment和空文件夹，通过Windows-MCP真实拉绳、挂图片/文档，等待自然成熟后实际剪切。`logs/native-uat/oxidation-bolete-mature-1.png`与`oxidation-after-cut-1.png`分别显示完整浅黄菌柄和剪后蓝切口。未用CDP输入、游戏状态写入或时间改写。

旧录像标称60fps但实际约28fps。本轮直接GDI采集(760,490,160,160)区域，保留微秒编码时间基准和passthrough PTS；最终`logs/oxidation-uat/cut-native.mp4`含2389个原始帧、最后PTS39.989951秒，平均59.715fps，未插帧。第一次校准输出被30fps时间基准限制；`-enc_time_base 1:1000000 -fps_mode passthrough`后3秒校准得到180帧。最初同时指定-r与passthrough的试验被FFmpeg拒绝，未作为成功录像。

`cut-ffmpeg.err.log`的原始demux时间戳提供首帧epoch1792386412.843318，`scripts/sample-oxidation-uat.mjs`只读收集performance.timeOrigin、performance.now、Date.now及原生pointerdown。Date.now与origin+performance偏差为-1.10至+2.30ms。原生down对应视频13.930682秒；中心下方避开高光和描边的10个切口内部像素用于颜色计量。

`cut-analysis.json`记录：中心RGB中位数跨入深蓝判据(B≥120、R/B<0.4、G/B<0.6)在原生down后411.2–429.7ms之间；`cut-timed-contact.png`的494.9ms原始帧也肉眼可见深蓝。最终稳定中位色约(24,58.5,179.5)，接近稳定色的RGB距离<10首次在529.6ms。只读cutAge在492.8ms采到0.49999999999999994、509ms采到0.5。颜色阈值、采样状态和最终颜色分别报告，不把数值状态饱和当成所有像素的即时显示。本次半秒内可见深蓝子项观察达标；精确全切口终值仍未证明。

可复现分析：`scripts/analyze-bolete-oxidation.py`直接解码原始PTS并生成同一计量/接触表，不改变录像或游戏。切口附近最大原始帧间隔52.728ms、间隔中位数16.634ms；平均帧率不意味着每一帧都严格16.667ms。分析中也不将旧素材的标称帧率当作实际采集率。

测试后正常退出恢复13ms，见`logs/native-uat/oxidation-018-normal-restore.json`。四项自建夹具经哈希/空目录核对清理，清单cleanedAt已记录；麦克风未启用。产品代码与0.1.8便携包未改动，本轮只新增观测/分析脚本和证据。完整UAT、独立Computer Use鼠标和后置音频仍未通过。


## 吸湿盒透明边界与原生水面复测

旧`logs/material-uat/box-final-stream-frame.png`可见盒体外硬边蓝色矩形。根因是BoxFillFilter直接覆盖art alpha：即使输入为透明角落，也输出水alpha0.55或空仓alpha0.12。`scripts/check-box-water-shader.cjs`在隐藏的原生Electron WebGL2上下文直接编译/绘制产品着色器，使用0°/110°形状的alpha输入、fill0/0.25/1及wave0.008/0.045共12组合，逐像素检查透明区、源alpha上限及预乘颜色。旧版每组100–188个透明输入像素被画出，alpha增加154–364处；before.json/exit1保留失败，after.json/exit0全部为0。测试实际检查GPU输出，不把Shader字符串匹配当作视觉证明。

源码保留源透明像素，并对半透明边缘取min(源alpha,水/空仓alpha)，颜色随alpha一起预乘。类型/构建、68项现有机械检查及上述12个GPU组合通过；GPU回归单列，不将机械总数虚增为80。

原生生产桌面复测使用此前真实烘熟售卖赚得120币的未改写存档副本，见`logs/box-water-uat/save-provenance.json`。Windows-MCP实际从商店买1盒，120→90币；自然满水后真实2秒拖动，再拖至真实回收站。未用调试写币、写水量、改时钟或模拟输入。没有创建本轮桌面文件夹具。

`slosh-native.mp4`及已检查的`slosh-aligned-contact.png`把原始帧按只读位置对齐，能看到水面波峰/波谷沿盒内移动；末帧盒子已回槽，空裁切不当作水面消失。`pour-native.mp4`约30秒/901原始帧（约30fps），`refill-native.mp4`约60秒/2641帧（约44fps）；均保留微秒时间基准、未插帧。`pour-contact.png`未再见盒外矩形，水流本身仍短且不够清楚。`refill-contact.png`显示白颗粒恢复后逐渐减少、底部水面升高。

只读1282次采样见`pour-pose.json`/`pour-summary.json`：17次pouring，最高110°，首个倾倒完成采样fill0.0002，随后自然升至0.5482。最初`natural-fill-native.mp4`开始时已满水，只能作为满盒证据，不能冒充完整涨水过程；重新积水证据使用refill录像。源码退出恢复20ms，`logs/native-uat/box-water-source-normal-restore.json`。声音/麦克风按用户要求继续后置，清澈水流整项仍未通过。

可复现接触表：`scripts/analyze-box-water-native.py`，通过现有运行实例的只读timeOrigin与GDI日志对齐原始帧；仅分析，不触发输入。0.1.9成品打包/启动核对另记，旧0.1.8哈希保持不变。


## 最终便携版0.1.9

`release/Cyber Damp 0.1.9.exe`：113789492字节，SHA256 `3AB28045D9B172D04D580BAFBB3EA5642A86833F339430C7AA2AC6AFF0DA0D85`。包含盒体alpha边界修复；`logs/box-water-uat/final-019-packaged-assets.json`确认24项资源/脚本与dist一致。实际IPC版本0.1.9、unlocked、29项、fixtures=[]、ropes=[]、boxes=[]；重启复核同样通过。已检查`logs/native-uat/final-019-ready-desktop-1.png`为装配后桌面；第一次`final-019-desktop-1.png`仍是加载中的原生桌面，不计就绪成功截图。

正常退出13ms、强杀65ms恢复原生图标，见`final-019-normal-restore.json`及`final-019-forced-restore.json`。这是Win32可见性计时，不冒充鼠标点击退出按钮。源码原生晃水/倾倒录像与最终包启动证据分别保存，不将源码玩法观察冒充成品全部玩法重测。

`logs/box-water-uat/final-019-cleanup.json`确认无Cyber Damp/Electron/ffmpeg测试进程，前轮4项95530a05夹具仍全部不存在；本轮未创建新桌面夹具。旧0.1.8哈希保持E77A6DB9851608A7A75BD34EF2B6089C2DD29E7D25A92324D6C7A35B4452CA49。自动审批以blocked by policy拒绝删除单个Python分析缓存的清理命令，未给更具体理由；缓存保留在scripts/__pycache__，不在产品打包范围内，也没有绕过该拒绝。diff空白检查通过，完整UAT继续未通过。

## 2026-10-19 用户要求停止迭代时的源码状态

按用户要求停止继续测试与实现，保存当前工作。最新源码调整桌面网格的顶部留白、行距和底部文件名空间，保留旧网格的容量；29项真实桌面的原生截图已检查，顶部菌盖和相邻文件名完整显示。高密度桌面的视觉可读性尚未验收，倒水水流仍需继续验收。

源码已通过类型检查、构建和70/70项机械检查；证据为logs/layout-flow-uat/row-after-tests.log及logs/native-uat/layout-flow-row-ready-1.png。70项为源码回归结果，不代表完整感官UAT通过。最后源码实例已正常退出，原生图标16ms恢复，记录于logs/native-uat/layout-flow-stopped-normal-restore.json。

最后便携包仍为0.1.9，上述最新网格调整尚未重新打包。完整感官UAT、独立Computer Use鼠标验收及用户后置的声音/麦克风测试均未完成。运行日志、录像、分析缓存和便携程序保留在本机，不纳入Git提交。
