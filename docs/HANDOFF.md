# 交接说明（HANDOFF）

> 给接手 dsh-plugin-clinic 剩余任务的 agent。本文档**自包含**：不依赖任何此前会话的上下文。
> 项目位置：`D:\agentwork\code\dsh-plugin-clinic`（独立 npm 插件仓库，非官方 workspace）。
> 状态：实施完成（代码 + 测试 + 构建全绿），剩余真实环境验收与发布。详见 [STATUS.md](STATUS.md)、[PLAN.md](PLAN.md)。

## 0. 项目是什么

**插件诊所**：DeepSeek Harness（DSH）的外部插件，对 `$DSH_HOME/profiles/*` 已安装插件集合做
只读健康体检（加载健康/依赖完整/版本兼容/安装脚本风险/重复/patch 引用完整/来源），
三个交付面：模型工具 `plugin_health`、Web 体检面板（设置→插件→体检 tab）、
`/clinic` HTTP 路由（JSON 报告）。单 npm 包 `dsh-plugin-clinic`，Host half + Client half 双形态。

生态定位：管理类插件是红海（10+）；`dsh-plugin-doctor`（外部 CLI，作者/CI 装前单包体检）与
`dsh-plugin-audit`（会话内单目录安全审计）都不覆盖"装进 DSH 之后、对已安装集合持续体检 + 面板"，
本插件补这一环。完整证据链：`D:\agentwork\code\deepseek-harness\docs\research\2026-08-16-dsh-community-plugin-gap-research.md`。

## 1. 当前状态（已验证）

- `pnpm run typecheck` ✅ 全绿
- `pnpm run test` ✅ 78/78（engine 单测、inventory/report 单测、工具/路由单测、真实 Loader 组合测试、组件测试）
- `pnpm run build` ✅ 产出 `lib/`（Host ESM）+ `lib/client.js`（官方 `__ModuleLoader__.load` 闭包工厂格式）+ d.ts
- 覆盖率：语句 90.5%（剩余行由断言覆盖，v8 行映射噪声已加带理由 ignore）
- 文档全套：AGENTS.md、README 双语、docs/PLAN、docs/STATUS、docs/usage、docs/development、docs/checks、CHANGELOG

## 2. 剩余任务（按优先级）

### T1：真实环境验收（发布前 gate，最高优先）

需要一台装有真实 dsh CLI 的机器（`dsh --version` 可跑；项目开发环境在 Windows）。

步骤：
1. `dsh plugin --profile web add <本仓库路径或本地 pack 的 tgz>`，重启；
2. 打开 Web GUI → 设置 → 插件，确认出现"体检"tab 且显示当前 profile 插件健康度
   （**这是唯一未实测的假设：外部 Client half 能否被官方 web GUI 加载**。构建格式已按官方
   配方复刻，但必须真实验证）；
3. 人为破坏：往 profile 的 `dsh.profile.bundles` 塞一个不存在的包 → 面板标红 critical、
   会话中调用 `plugin_health` 报告含对应 finding；
4. headless profile 下确认 `plugin_health` 工具可用（无路由注册报错）；
5. `curl http://127.0.0.1:<port>/clinic/health` 返回 200；伪造 Host 头返回 403；
6. `dsh plugin remove dsh-plugin-clinic` 后确认无残留（工具/路由/tab 随 fiber 撤销）。

失败预案：若外部 Client half 无法加载，降级方案 = 面板改为独立 HTML 页 + `/clinic` 路由提供
数据（Host 侧不变，只改 Client 形态），并更新 README 与 Known Limitations。

验收标准：上述 6 步全部通过；结果记录到 `docs/STATUS.md`。

### T2：发布 v0.1.0

1. `npm view dsh-plugin-clinic` 确认名称仍未被占用（2026-08-16 核验过未被占用）；
2. 在可联网环境 `pnpm run build && pnpm publish`（`prepare` 脚本已保证 git 安装也可构建）；
3. 创建 GitHub 仓库（建议同名），打 `dsh-plugin` topic（官方 CONTRIBUTING 指定的生态入口）；
4. 提交社区清单：awesome-dsh-plugin（270+ 收录）、Oh-My-DSH、beancookie 等（找到对应仓库提 PR/issue）。

### T3：CI 兼容矩阵

官方仍处 rc 阶段（peer 依赖用 `^0.1.0-rc.6` 体系），API 会破坏性演进。参照
`dsh-plugin-doctor` 先例建 GitHub Actions：矩阵跑多个 DSH 版本（如 0.1.0-rc.6 与最新），
每版执行 typecheck + test + build。官方包升级后重跑全部测试。

### T4（低优先）：联网对照官方模板

`dsh-external/plugin-template` 是 GitHub 仓库（npm 无包）。联网后对照其骨架修订
`docs/PLAN.md` §4/§12 与本仓库骨架的差异；本仓库以 dsh-eval 包结构 + 官方规范为基准，
已有完整文档体系，预期差异很小。

## 3. 接手必读（关键上下文与坑）

- **文档优先**：AGENTS.md（纪律）→ docs/PLAN.md（设计）→ docs/STATUS.md（进度）→
  docs/development.md（构建/测试/发布）→ docs/checks.md（检查规则）。
- **官方机制锚点**（均已实证，见 PLAN 附录 A）：`ctx.loader.entries()` 快照（跳过
  `options.group`）；`settings.plugins.tab` 官方扩展点（本插件注册 id `clinic`、order 20）；
  webServer 命名路由（`ctx.webServer.register`，Host 头 loopback 防护）；
  client bundle = `window.__ModuleLoader__.load({id, factory})`（tsdown 配方复刻）。
- **已知坑**：
  1. 官方 npm client 类型包 d.ts 带 `.ts` re-export，外部消费者不可解析；类型面已本地化在
     `src/client/slot-types.ts`（对照官方源码，勿删）；
  2. 官方依赖统一 `^0.1.0-rc.6`（npm 0.0.1-rc.1 系列依赖链断裂，dsh-compact 不存在）；
  3. tsdown 必须 ^0.22.x（0.9.x 与 rolldown 不兼容）；`external`/`noExternal` 已弃用，
     用 `deps.neverBundle`/`deps.alwaysBundle`；
  4. fetch 不允许自定义 Host 头——伪造 Host 的测试必须用 node:http request；
  5. vitest 4 的 v8 coverage 对 esbuild 转译行有映射噪声——真实分支已补测，
     剩余行带理由 ignore，勿盲目删 ignore 或追 100%；
  6. Node resolver 会读目标 package.json——无效 JSON 的包表现为"不可解析"而非"解析后失败"。
- **命令**：`pnpm install` / `run typecheck` / `run test` / `run test:coverage` / `run build` /
  `run clean`；测试环境无需 DEEPSEEK_API_KEY（组合测试用 fixture DSH_HOME + mock tools registry）。
- **纪律红线**（AGENTS.md）：引擎纯函数（无 I/O、无 ctx，输入经 inventory 收集）；
  只读第一原则（任何写入必须改 PLAN 再动手）；evidence 只含元数据（脚本只报名不报内容）；
  改公开契约（报告 schema/工具参数/路由/Config）必须同步 README + docs/usage + docs/checks。

## 4. 完成定义

T1-T3 全部完成 + `docs/STATUS.md` 更新为"已发布"状态 = 项目移交完成。
