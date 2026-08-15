# Changelog

本项目的变更日志。格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

## [Unreleased]

### Added（规划中，未发布）

- 插件诊所 v1：`plugin_health` 模型工具、Web 体检面板（Settings → 插件 → 体检）、
  `/clinic` HTTP 路由、`schemaVersion: 1` 报告契约。
- 8 项只读检查：`load-health`、`bundle-manifest`、`peer-deps`、`runtime-compat`、
  `install-scripts`、`duplicate`、`patch-health`、`provenance`。
- 配置：`profiles` / `enableTool` / `enableWebRoute` / `webRoutePrefix` /
  `includeHomePatches`。
