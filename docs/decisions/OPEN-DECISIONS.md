# OPEN-DECISIONS — 回南天 Cyber Damp MVP

> 悬而未决登记册。铁律：只追加 + 就地关闭（OPEN → RESOLVED，补 Resolution 字段）。
> 三类固定 slug：waiting-on-external-condition / design-decision-to-evaluate / existing-design-boundary

| Date | Source | Open Item | Related Constraints | Current Leaning | Blocked By | Resolves When | Status |
|------|--------|-----------|---------------------|-----------------|------------|---------------|--------|
| 2026-10-17 | Phase 1 | 三文档（PRD v1.1 / 架构 v1.0 / 设计 v1.1）提交用户确认 | 专家团流程唯一交互点 | 三文档已对齐（天气本地化/Lucide 1.58.0/蘑菇分级） | 等用户回复确认 | 用户说 OK 后自动进入 Phase 1.5 Spec 生成 | OPEN |
| 2026-10-17 | Phase 1 | Demo 控制台胆小菇缩头行为范围 | PM P1 / 架构师请示 / 设计师已含设计 | 保留（纯行为实现，路演价值高） | 无（总监已裁定） | 2026-10-17 总监确认保留 P1，Spec 锁定 | RESOLVED |
| 2026-10-17 | Phase 1 | 绳索承重单位漂移（质量 vs 字节）stale-scan:exempt | 架构文档曾写 6/25 质量单位，被设计读成 GB（历史标注保留原貌） | 字节累计判定：麻绳 5GB / 红塑料绳 25GB / 不锈钢杆 ≥100GB；sizeToMass 仅用于下垂深度 | 无（对数映射下 5GB vs 25GB 质量仅 5.8 vs 6.3，按质量判三档无差异属沉默逻辑错误） | 2026-10-17 总监裁定按 PRD 字节语义，Spec 第 4 章锁定 | RESOLVED |
| 2026-10-17 | Phase 1 | 强调色域隔离（陈铜金进画布边界） | 设计师 v1.1 / 架构师裁决 | 陈铜金 #C0952F 唯一主色限 DOM chrome；in-world 画布用世界色板，金色仅进画布三处（金币粒子/+N 飘字/选中描边/晴天丁达尔光）；干草绿不进画布 | 无 | 2026-10-17 总监接受裁决，Spec 第 8 章锁定 | RESOLVED |
| 2026-10-17 | Phase 1.5 | 304 不锈钢杆优先级 | PM 列 P1（验收后紧接）/ 架构师列 P0 | P1：P0 五模块验收通过后紧接做（毕业目标，经济闭环终点） | 无（总监已裁定） | 2026-10-17 Spec v1.0 锁定为 P1 | RESOLVED |
| 2026-10-17 | Phase 1.5 | 音频类蓄水鼓袋是否降级 P1 | PM 预留降级通道 / 架构师列 P0 必须 | P0：模块二验收线含四类格式差异化，音频是其一 | 无（总监已裁定） | 2026-10-17 Spec v1.0 锁定为 P0 | RESOLVED |
| 2026-10-17 | Phase 1.5 | Demo 控制台一键挂满路演翻车陷阱 | 架构师 advisory：最重5文件 Σ36-69GB 超麻绳 5GB，点按钮双绳齐断 | 容量预检（贪心截断）+ 深V演示绳固定红塑料绳 + 手动挂载不拦截（god console 唯一例外） | 无（总监接受，写入 AC-32/AC-33） | 2026-10-17 Spec v1.0 锁定 | RESOLVED |

> 汇总：3 未决 + 3 已决（截至 2026-10-17 Phase 1 结束）
> 每次 Phase 开始时复现本表到工作上下文最前面，逐条判断能否关闭。
