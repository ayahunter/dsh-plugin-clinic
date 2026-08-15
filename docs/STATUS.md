# 进度状态（STATUS）

> 更新：2026-08-16（真实环境验收完成，发现并修复 4 个真实 bug；待发布）。
> 权威设计见 [PLAN.md](PLAN.md)；本文只记录"做到哪了"。

## 已完成

- [x] **生态调研与竞品核查** —— 22 类插件全览；dsh-eval / dsh-plugin-doctor / dsh-plugin-audit
  三份竞品实证核查（npm registry + 源码解包）；定位"已安装集合的持续体检"缺口。
  证据链：`D:\agentwork\code\deepseek-harness\docs\research\2026-08-16-dsh-community-plugin-gap-research.md`
- [x] **方案规划** —— `docs/PLAN.md`
- [x] **未决事项（附录 B）全部解决** —— 见旧版记录（Client 构建格式已实证、npm 名称未被占用、
  plugin-template 待联网对照）
- [x] **仓库骨架 / 诊断引擎 / 交付面 / Web 面板 / 测试 / 构建 / 覆盖率** —— 实施阶段全绿
  （typecheck、88/88 测试、build、覆盖率语句 90.51%）
- [x] **真实环境验收（T1，2026-08-16）** —— 官方 rc.5 真实 dsh（harness 源码 CLI）实证：
  1. `dsh plugin --profile web add <仓库路径>` 成功，bundle 自动调和，重启无错；
  2. **外部 Client half 在官方 web GUI 加载成功（里程碑 gate）**：Edge headless 驱动真实
     GUI，设置 → 插件 → "体检" tab 出现并渲染健康摘要（严重/警告/提示计数 + 插件卡片）；
  3. 人为破坏（bundles 塞 `dsh-plugin-nonexistent`）→ 真实 rc.5 **boot fail loud**（进程
     退出 1），`plugin_health` 在 headless profile 真实 agent 调用中报告 web profile 的
     critical finding（`Bundle "dsh-plugin-nonexistent" is not resolvable`）；
  4. headless profile 下 `plugin_health` 真实可用（真实 Loader + 真实 LLM 调用成功）；
  5. `curl /clinic/health` 200（真实 JSON 报告）；伪造 Host 头 403；
  6. `dsh plugin remove` 后无残留：manifest 恢复原状、路由随 fiber 撤销（SPA 壳）、
     `__DSH_BOOT__` 无条目、client bundle 404。
- [x] **T1 验收驱动修复（4 个真实 bug，已提交 1e627e0）**：
  1. Host 路由装载竞争 → `ctx.inject(['webServer'])` 惰性挂载（invariants 同理）；
  2. Client `apply(ctx, undefined)` 崩溃（官方 loader 对无配置行传 undefined）→ config 可选；
  3. patch YAML 官方 `!!js` 方言解析失败 → 按 `entryListSchema` 方言解析（假 critical 消除）；
  4. patch-health insert 按真实安装解析（in-box fallback + 子路径）+ override 按原始
     row id 匹配（快照新增 `rawId`）——真实部署 100+ 假 critical 全部消除，
     真实信号（peer/兼容/脚本/重复）保留。
- [x] **CI 兼容矩阵（T3，已提交 36f7652）** —— `.github/workflows/compat.yml`：
  DSH `0.1.0-rc.3` 与 `0.1.0-rc.6`（npm registry 现存两档）× Ubuntu/Windows，
  每格 pin 依赖后跑 typecheck + test + build；`scripts/pin-dsh-version.mjs`。
  **状态：文件完成，待推送到 GitHub 后生效。**

## 进行中 / 待办

- [x] **发布 v0.1.0（T2，2026-08-16 完成）** ——
  - npm：`dsh-plugin-clinic@0.1.0` 已发布（`latest` tag）；发布前发现并修复发布阻断 bug
    （types/exports/files 指向不存在的 `lib/types/` 且 files 漏掉运行时模块，提交 28610ec）；
    tarball 安装冒烟测试通过（main/invariant/types 可加载、13 个 d.ts、engine 完整）。
  - GitHub：`ayahunter/dsh-plugin-clinic` 仓库已存在并推送（用户完成）；补设仓库
    description、homepage（npm 包页）与 **`dsh-plugin` topic**（Oh-My-DSH 自动收录
    入口 + awesome 清单要求）；`v0.1.0` tag 已推送并**触发 CI 兼容矩阵**。
  - 剩余：awesome-dsh-plugin 精选清单 PR（条目文本已备妥，见下节）。
- [ ] **CI 兼容矩阵结果（T3）** —— `v0.1.0` tag 已触发（2 OS × rc.3/rc.6 四单元）；
  结果待确认（rc.3 单元失败属预期发现，记录后跟进）。

## 社区清单提交准备（T2 调研结论，待 GitHub 凭据）

| 清单 | 仓库 | 收录方式 |
|---|---|---|
| awesome-dsh-plugin（2649★） | awesome-dsh-plugin/awesome-dsh-plugin | PR：README.md + README.zh.md 的 Development & Runtime 类别各加一行 `- [name](link) — 一句话`；同时要求仓库打 `dsh-plugin` topic |
| Oh-My-DSH | like-study1/Oh-My-DSH | **打 `dsh-plugin` topic 后自动同步**（每 4 小时抓取主题快照 + 人工策展），无需 PR；备选 Issue 登记 |
| beancookie/awesome-dsh-plugin | beancookie/awesome-dsh-plugin | 欢迎 PR（README #贡献 链接） |

PR 条目文本模板（等 GitHub 仓库创建后替换 `<owner>`）：
- EN：`- [dsh-plugin-clinic](https://github.com/<owner>/dsh-plugin-clinic) - Read-only health clinic for the installed DSH plugin set: loader health, dependency integrity, version compatibility, install-script risk, duplicates and patch integrity, delivered as a model tool, a Settings dashboard and JSON reports.`
- ZH：`- [dsh-plugin-clinic](https://github.com/<owner>/dsh-plugin-clinic) - 已安装 DSH 插件集合的只读体检诊所：加载健康、依赖完整、版本兼容、安装脚本风险、重复与 patch 引用，交付模型工具、设置面板与 JSON 报告。`

**策略**：创建 GitHub 仓库后立即打 `dsh-plugin` topic（同时满足 Oh-My-DSH 自动收录与
awesome 主清单要求），再向 awesome-dsh-plugin 提 PR，beancookie 视需要提 PR。

## 阻塞解除步骤（T2）——已完成，仅剩 awesome PR

1. ~~npm publish~~ ✅ 2026-08-16 完成（账号 ayahunter；2FA 经 bypass token 通过；
   期间修复 .npmrc token 行缺失 `//` 前缀的格式问题）。
2. ~~GitHub 仓库 + topic~~ ✅ 完成（description/homepage/topic 已通过 API 设置）。
3. **awesome-dsh-plugin PR**（待做，条目文本见下节）：
   - fork `awesome-dsh-plugin/awesome-dsh-plugin` → 在 `README.md` 与 `README.zh.md`
     的 Development & Runtime 类别追加一行条目（文本模板见下节）→ PR。
   - beancookie/awesome-dsh-plugin 视需要提 PR。
   - Oh-My-DSH 无需操作（`dsh-plugin` topic 已打，4 小时自动同步）。

## 真实环境观察（T1 附带结论）

- **boot fail loud 前置**：rc.5 对不可解析 bundle 直接拒绝 boot（退出码 1）——"面板标红
  critical"与"web profile 可 boot"在真实环境互斥；面板 critical 渲染由组件测试覆盖，
  报告/工具侧 critical 已真实实证。README 无需改（行为符合"boot 时才暴露提前到任何时刻"）。
- **报告数字随会话浮动**：web profile 的 `duplicate` warning 随活跃会话数变化
  （per-session preset 行），引擎如实反映实时 Loader 树。
- **`profiles/node_modules` 被当作 profile 扫描**（安装级 fallback 目录，无 manifest，
  报告为空 profile）——无害，列为观察项。

## 阻塞与风险

| 项 | 状态 | 说明 |
|---|---|---|
| 外部 Client half 真实加载 | **已解除** | 2026-08-16 真实 GUI 验证通过（里程碑 gate） |
| Electron 桌面壳 fetch 通道 | 风险 | 未验证；列入 README Known Limitations |
| 官方 0.1.0-rc API 漂移 | 跟踪中 | CI 矩阵（rc.3/rc.6）已就绪，推送 GitHub 后生效 |
| 官方 npm client 类型包断链 | 已规避 | 类型面本地化（src/client/slot-types.ts） |
| npm publish / GitHub 凭据 | 待核验 | T2 进行中 |
