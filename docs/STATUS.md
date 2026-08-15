# 进度状态（STATUS）

> 更新：2026-08-16（实施阶段完成，待真实环境验收与发布）。
> 权威设计见 [PLAN.md](PLAN.md)；本文只记录"做到哪了"。

## 已完成

- [x] **生态调研与竞品核查** —— 22 类插件全览；dsh-eval / dsh-plugin-doctor / dsh-plugin-audit
  三份竞品实证核查（npm registry + 源码解包）；定位"已安装集合的持续体检"缺口。
  证据链：`D:\agentwork\code\deepseek-harness\docs\research\2026-08-16-dsh-community-plugin-gap-research.md`
- [x] **方案规划** —— `docs/PLAN.md`
- [x] **未决事项（附录 B）全部解决**
  - 外部 Client 构建格式：**已解决并验证**——`window.__ModuleLoader__.load({id, factory})`
    闭包工厂配方复刻自官方 `packages/client/tsdown.client.ts`；构建产物格式与官方一致
    （head/tail 实测）
  - npm 名称占用：`dsh-plugin-clinic` **未被占用**（2026-08-16 核验）
  - `dsh-external/plugin-template`：npm 无此包；以 dsh-eval 包结构 + 官方规范为基准实施；
    联网后对照 GitHub 仓库修订（见 PLAN 附录 B 备注）
- [x] **仓库骨架** —— package.json（bundle + client 双声明）、tsconfig 双配置、
  tsdown.config.ts（官方配方）、cordis.patch.yml、LICENSE、.gitignore、AGENTS.md、README 双语
- [x] **诊断引擎** —— `src/types.ts`（Config zod schema + 报告契约 schemaVersion 1）、
  `src/engine/inventory.ts`（loader 快照、profile/包/patch 收集、环境收集）、
  `src/engine/checks.ts`（8 检查器纯函数）、`src/engine/report.ts`（组装/折叠/summary/过滤）
- [x] **交付面** —— `src/tool.ts`（plugin_health：完整 output schema + details 裁剪 +
  markdown 渲染）、`src/route.ts`（/clinic 前缀路由 + Host 头防护）、`src/run.ts`（runner 契约）、
  `src/index.ts`（Host apply 组装：工具 + 路由 + invariant 可选注册）、`src/invariant.ts`
- [x] **Web 面板** —— `src/client/`（官方 `settings.plugins.tab` 注册形态 + 本地类型面
  slot-types.ts + ClinicTab 组件 + locales 双语）
- [x] **测试** —— 78 个测试全绿：8 检查器好坏 fixture 对、report 折叠/过滤/投影、
  inventory 解析与收集（临时 DSH_HOME fixture）、工具渲染与注册、路由 stub + 真实 HTTP、
  **真实 Loader 组合测试**（cordis-plugin-loader + 真实 webServer + fixture DSH_HOME +
  Host 头伪造 403）、组件测试（jsdom）
- [x] **构建验证** —— `pnpm run build` 产出 `lib/`（Host ESM）+ `lib/client.js`（官方格式）+
  d.ts；`pnpm run typecheck` 全绿
- [x] **覆盖率** —— 语句 90.5%；engine 层 80-96%（剩余行全部由断言覆盖，v8 行映射噪声
  已加带理由的 ignore；inventory/report 的真实缺口分支已补测）

## 进行中 / 待办

- [ ] **真实环境验收**（`docs/development.md` §验收清单）——需要真实 dsh 安装：
  1. `dsh plugin --profile web add dsh-plugin-clinic` 后重启无错；
  2. 设置 → 插件 → "体检" tab 显示健康度（**外部 Client half 在官方 web GUI 的加载是
     里程碑 gate，未实测**）；
  3. 人为破坏（塞不存在的 bundle）→ 面板标红 critical、`plugin_health` 报告含 finding；
  4. headless profile 下工具可用；5. remove 无残留。
- [ ] **发布 v0.1.0** —— npm publish（`pnpm run build` 后）+ GitHub 仓库 + `dsh-plugin` topic
  + 提交社区清单（awesome-dsh-plugin / Oh-My-DSH）
- [ ] **CI 兼容矩阵** —— 多 DSH 版本实测（doctor 先例），官方 rc API 漂移跟踪

## 阻塞与风险

| 项 | 状态 | 说明 |
|---|---|---|
| 外部 Client half 真实加载 | **里程碑 gate** | 社区 Web GUI 插件有先例且构建格式已按官方配方复刻，但必须在真实 web profile 验证；失败则降级为独立 HTML 面板 |
| Electron 桌面壳 fetch 通道 | 风险 | 未验证；列入 README Known Limitations |
| 官方 0.0.1-rc/0.1.0-rc API 漂移 | 风险 | peer 范围已用 ^0.1.0-rc.6 体系；发布后 CI 矩阵跟踪 |
| 官方 npm client 类型包断链 | 已规避 | npm 发布 d.ts 带 `.ts` re-export，外部消费者不可解析；已本地化类型面（src/client/slot-types.ts，对照官方源码） |
