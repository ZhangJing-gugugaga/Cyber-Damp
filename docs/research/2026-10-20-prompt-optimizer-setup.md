# 项目级 Prompt Optimizer 与 Goal Prompt 检查

## 安装记录

- 官方仓库：https://github.com/linshenkx/prompt-optimizer
- 检出提交：`9141ae9c98b3e50252c0e0004b6cc597baec48cd`，项目版本 `2.11.12`。
- 工具目录：`.tools/prompt-optimizer/`；安装 Core + MCP Server 所需依赖并构建成功，未安装 Web/桌面应用。
- 独立运行时：`.tools/prompt-optimizer-runtime/`，Node `24.15.0`、pnpm `10.6.1`。系统原有 Node `24.14.0` 不满足上游某依赖的最低版本，未修改全局版本。
- 依赖缓存：`.tools/pnpm-store/`。工具源码、依赖、运行时、缓存与 `.local/prompt-optimizer/` 输出均由根 `.gitignore` 忽略。主产品 package.json、锁文件未加入第三方工具依赖。
- 当前是项目内可调用的 MCP stdio 工具，通过脚本启动并关闭，不是已注册到 Codex 会话的全局 MCP。

## 复现

在项目目录克隆官方仓库到上述工具目录并检出记录的提交，然后执行：

```powershell
npm install --prefix .tools/prompt-optimizer-runtime --no-audit --no-fund node@24.15.0 pnpm@10.6.1
$toolNode = (Resolve-Path '.tools/prompt-optimizer-runtime/node_modules/node/bin/node.exe').Path
$toolPnpm = (Resolve-Path '.tools/prompt-optimizer-runtime/node_modules/pnpm/bin/pnpm.cjs').Path
$env:Path = (Split-Path $toolNode -Parent) + ';' + $env:Path
Push-Location .tools/prompt-optimizer
& $toolNode $toolPnpm install --frozen-lockfile --ignore-scripts --filter '@prompt-optimizer/mcp-server...' --store-dir ../pnpm-store
& $toolNode $toolPnpm -r --filter '@prompt-optimizer/mcp-server...' build
Pop-Location
& $toolNode scripts/validate-goal-prompt.mjs
& $toolNode scripts/optimize-goal-prompt.mjs
```

用户授权从 `E:/Desktop/.env` 的 aiping 条目读取密钥，格式支持中文/英文冒号与等号。该路径实际是文件。脚本只在进程内解析所需项，不打印文件内容、不打印密钥、不将密钥写入工具配置或版本库。密钥通过子进程环境传入；未读取其他凭证或 Codex 登录信息。

模型：用户指定 `DeepSeek-V4.1-Flash-1017`。端点按 [AI Ping 官方文档](https://aiping.cn/docs/API/text-models) 使用 `https://aiping.cn/api/v1`。提交内容仅为 Goal Prompt 与优化要求。

## 检验含义

`validate-goal-prompt.mjs` 实际调用上游 `ParameterValidator.validatePrompt` 和 `validateRequirements`，检查非空与长度；不构成语义质量评分。

`optimize-goal-prompt.mjs` 通过官方 MCP `iterate-prompt` 运行模型评审与优化；输出保存到被忽略的 `.local/prompt-optimizer/model-review.md` 和 JSON。调用成功不代表生产实现或原生 UAT 通过，也没有通用的“优化器认证合格”保证。对模型建议必须人工复核，尤其不能让优化器扩大需求、改变用户数值或删除用户最终视觉验收。

最终可执行输入：`docs/superpowers/specs/2026-10-20-desktop-mildew-goal-prompt.md`。原生项目开发尚未在本轮启动。

## 本轮实际结果

2026-10-20 官方 MCP stdio 连接成功，列出三个官方工具，使用用户指定模型实际调用 `iterate-prompt` 成功。模型提出 7 项逻辑与验收改进，已合并到最终 Goal Prompt：最终视觉确认不阻塞独立工作、明确测试范围、实现前冻结性能预算、细化证据、样片对照、禁止用范围外规避必交项、缺少条件不得误报完成。

人工复核另外修正两处：开场计时按动画首帧至目标状态稳定，不包含提示等待与资源加载；区分验收文档状态和 Goal 工具状态，避免误用工具。没有虚构量化评分或“认证通过”。最终文本再次通过官方输入校验。
