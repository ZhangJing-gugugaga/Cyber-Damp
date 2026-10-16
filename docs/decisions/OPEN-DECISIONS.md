# OPEN-DECISIONS — 回南天 Cyber Damp MVP

> 悬而未决登记册。铁律：只追加 + 就地关闭（OPEN → RESOLVED，补 Resolution 字段）。
> 三类固定 slug：waiting-on-external-condition / design-decision-to-evaluate / existing-design-boundary

| Date | Source | Open Item | Related Constraints | Current Leaning | Blocked By | Resolves When | Status |
|------|--------|-----------|---------------------|-----------------|------------|---------------|--------|
| 2026-10-17 | Phase 1 | 三文档（PRD v1.1 / 架构 v1.0 / 设计 v1.1）提交用户确认 | 专家团流程唯一交互点 | 三文档已对齐（天气本地化/Lucide 1.58.0/蘑菇分级） | 等用户回复确认 | 用户说 OK 后自动进入 Phase 1.5 Spec 生成 | OPEN |
| 2026-10-17 | Phase 1 | Demo 控制台胆小菇缩头行为范围 | PM P1 / 架构师请示 / 设计师已含设计 | 保留（纯行为实现，路演价值高） | 无（总监已裁定，待 Spec 锁定为 P1） | Spec 生成时锁定 | OPEN |
| 2026-10-17 | Phase 1 | 304 不锈钢杆优先级 | PM 列 P1（验收后紧接）/ 架构师列 P0 | P0 验收通过后紧接做（毕业目标，经济闭环终点） | 依赖 P0 五模块验收通过 | P0 验收后 | OPEN |
| 2026-10-17 | Phase 1 | 水珠折射桌面背景不可行的视觉补偿方案 | 透明 WebGL 画布无法采样桌面像素（架构师诚实约束） | 图标自身纹理局部折射 + 高光 + 暗环（架构 §5.3 / 设计 §2.6 已写入） | 无（方案已定，Spec 需写入） | Spec 生成时锁定 | OPEN |
| 2026-10-17 | Phase 1 | 音频类蓄水鼓袋是否降级 P1 | PM 预留降级通道 / 架构师列 P0 必须 | 保留 P0（模块二验收线含四类格式差异化，音频是其一） | 无（总监已裁定） | Spec 生成时锁定为 P0 | OPEN |

> 汇总：5 未决 + 0 已决（截至 2026-10-17 Phase 1 结束）
> 每次 Phase 开始时复现本表到工作上下文最前面，逐条判断能否关闭。
