# Changelog

本项目的变更日志。格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

## [0.1.1] - 2026-08-16

### Fixed

- **peer-deps 误报（PR #1）**：peer 对照表扩展为 profile 中全部实际可解析的包
  （含 DSH 经 `~/.dsh/profiles/node_modules` 与安装目录 fallback 提供的 peer），
  消除 harness 提供 peer 被误报 `required peer <range>` 缺失的假 warning；
  exports 不暴露 `./package.json` 的包（如 `sharp`）按入口路径回退解析，
  不再误判为不可解析。

## [0.1.0] - 2026-08-16

### Fixed（真实环境验收发现）

- **Host 路由装载竞争**：`/clinic` 路由改为经 `ctx.inject(['webServer'])` 惰性挂载。
  真实 profile 树中 webserver 行与本插件并行装载，apply 时 `ctx.get('webServer')`
  可能未就绪导致路由从未注册（此前仅组合测试先提供服务的顺序通过）。
  `invariants` 注册同步改为惰性。
- **Client apply 空 config 崩溃**：官方 client loader 对无配置的 patch 行传入
  `undefined` config，`config.webRoutePrefix` 直接抛错使整个条目加载失败；
  改为 `config?.webRoutePrefix`，`apply` 签名将 config 标为可选。
- **patch YAML 官方方言解析**：官方 bundle patch 使用 `!!js` 表达式（Loader 的
  `entryListSchema`：JSON schema + `!!js` 标量类型）。此前默认 js-yaml schema 解析
  失败，所有官方 bundle 被误报 `bundle-manifest` critical；现按官方方言解析
  （`!!js` 构造为不透明节点，行结构提取不受影响）。
- **patch-health insert 解析语义**：insert 行包名改为按真实解析判定（含安装级
  fallback 的 in-box 包与 `@pkg/subpath` 子路径说明符），不再只查 manifest 成员，
  消除真实部署中官方 patch 的 100+ 条假 critical。
- **patch-health override 匹配**：override 行按原始 row id 匹配（loader 装载后
  entry id 带 `include:` 前缀）；快照新增 `rawId` 字段。

### Added

- 插件诊所 v1：`plugin_health` 模型工具、Web 体检面板（Settings → 插件 → 体检）、
  `/clinic` HTTP 路由、`schemaVersion: 1` 报告契约。
- 8 项只读检查：`load-health`、`bundle-manifest`、`peer-deps`、`runtime-compat`、
  `install-scripts`、`duplicate`、`patch-health`、`provenance`。
- 配置：`profiles` / `enableTool` / `enableWebRoute` / `webRoutePrefix` /
  `includeHomePatches`。
- CI 兼容矩阵：`scripts/pin-dsh-version.mjs` + `.github/workflows/compat.yml`
  （DSH `0.1.0-rc.3` 与 `0.1.0-rc.6` 双版本 × Ubuntu/Windows）。
