# dsh-plugin-clinic

**插件诊所** —— 对 DeepSeek Harness（DSH）已安装插件集合的只读健康体检。

[English](README.md) · [使用指南](docs/usage.md) · [检查项参考](docs/checks.md)

DSH 的"一切皆插件"把稳定性风险分散到了用户可自由组合的配置层——但没有任何东西告诉你
已安装的插件集合是否健康。`dsh-plugin-clinic` 补上这一环：体检 Harness home 下每个
profile 的插件，报告加载健康、依赖完整、版本兼容、安装脚本风险、重复与 patch 引用完整性；
全程只读、无外部状态。

## 特性

- **模型工具 `plugin_health`** —— agent 可以在会话内自检环境，把发现转成具体的修复建议。
- **Web 体检面板** —— 设置 → 插件 下的"体检"tab，按 profile 展示带严重性着色的插件卡片。
- **JSON 报告** —— 稳定的 `schemaVersion: 1` 契约，供 CI 与脚本消费。
- **8 项只读检查** —— 见 [docs/checks.md](docs/checks.md)：`load-health`（加载健康）、
  `bundle-manifest`（清单完整）、`peer-deps`（依赖满足）、`runtime-compat`（版本兼容）、
  `install-scripts`（安装脚本风险）、`duplicate`（重复）、`patch-health`（patch 引用完整）、
  `provenance`（来源标注）。
- **一行安装** —— 单个 npm bundle patch 同时挂载 Host 引擎与浏览器面板。

## 界面预览

官方 Web GUI 中的体检面板 —— 设置 → 插件 → 体检。插件卡片按严重性着色，可展开查看
每条发现；摘要条按严重级统计全部 profile 的 critical / warning / info：

![设置 → 插件 中的体检面板](docs/screenshots/clinic-tab-dashboard.png)

![健康摘要条](docs/screenshots/clinic-tab-summary.png)

## 安装

```sh
# 从 npm（预构建 lib/）
dsh plugin --profile web add dsh-plugin-clinic

# 或直接从 GitHub（源码安装；prepare 脚本负责构建，pnpm 会要求你显式允许一次构建——
# 语义见官方发布指南的 allowBuilds 说明）
dsh plugin --profile web add github:ayahunter/dsh-plugin-clinic
```

重启 profile。设置 → 插件 会出现"体检"tab；会话中获得 `plugin_health` 工具。

### 更新

```sh
# 在已保存的 semver 范围内升级（^0.1.0 → 最新 0.1.x）
dsh plugin --profile web update dsh-plugin-clinic
```

插件不会自动更新；更新后重启 profile。

## 快速开始

在安装了的 profile 的任意会话中：

```
体检一下我的插件
```

或直接调用工具，`{"details": true}` 可查看每条发现的证据。Web GUI 中打开
设置 → 插件 → 体检，一眼看全所有 profile 的健康度。

## 配置

在 profile 的 `cordis.patch.yml` 中编辑 bundle 行：

```yaml
- id: clinic
  name: 'dsh-plugin-clinic'
  config:
    profiles: []            # 要体检的 profile 目录名；空 = 全部
    enableTool: true        # 注册 plugin_health 工具
    enableWebRoute: true    # 存在 webServer 时注册 /clinic HTTP 路由
    webRoutePrefix: '/clinic'
    includeHomePatches: true
```

## HTTP 端点

| 端点 | 返回 |
|---|---|
| `GET /clinic/health` | 完整 `ClinicReport` |
| `GET /clinic/health/summary` | 面板首屏用的摘要投影 |

路由要求 loopback `Host` 头（DNS rebinding 防御，与官方 `/api` fence 同一精神）；
这不是认证。

## 架构

单 npm 包、双 half。Host half 拥有纯函数诊断引擎（`src/engine/`，无 I/O、无 ctx）、
`plugin_health` 工具与 `/clinic` 路由；浏览器 half 把体检 tab 注册进官方
`settings.plugins.tab` 扩展点，拉取与工具相同的报告。设计决策记录在仓库内部工作文档
（不随包发布）。

## Model Experience（模型体验）

### 请求上下文与条件

#### 模型看到什么

一个工具 schema：带 `profiles`、`severity`、`details` 参数的 `plugin_health`。
它像任何模型可见工具一样注册在 `ctx.tools` 上，因此 schema 会流入加载本插件的
profile 中每个 agent 的系统提示词组装。

#### Token 影响

注册时固定：每个 agent 一条工具 schema。执行结果是 `ClinicReport` JSON，大小随
被诊断插件数增长；`details: false`（默认）只返回计数，无论装了多少插件，模型可见
载荷都有界。

#### KV Cache 影响

工具 schema 属于固定提示词前缀，不使缓存失效。执行结果是单轮工具结果，
不属于任何后续请求前缀。

## 已知局限与后续工作（Known Limitations and Deferred Work）

- **只诊断，不修复** —— v1 只报告，修复是 agent/用户的行为；dry-run 修复方案输出
  计划在后续里程碑。
- **无 npm 在线检查** —— `deprecated` 标记与更新可用性在 v2（可配置 + 缓存）；v1 完全离线。
- **当前 profile 不可检测** —— DSH 没有暴露运行中 profile 名的 API，v1 体检全部 profile
  （配置可收窄）；从 argv 提取 `--profile` 仅作 UI 高亮，best-effort，绝非权威。
- **面板面向浏览器** —— 体检 tab 针对官方 Web GUI 验证；Electron 桌面壳的 fetch 走
  IPC bridge，尚未验证。
- **loader-only 插件** —— 不在 profile manifest 中的 entry 没有 package.json，
  peer/runtime/scripts 检查不适用，只有 load-health 与 provenance。
- **无源码级安全扫描** —— 那是 `dsh-plugin-doctor` 的职责；v2 计划可选集成其 CLI。
- **报告是即时快照** —— 无缓存、无历史、无订阅（刻意为之，与官方插件清单同一取舍）。

## 文档

- [docs/usage.md](docs/usage.md) —— 安装、配置、工具与面板用法
- [docs/development.md](docs/development.md) —— 构建、测试、发布、贡献
- [docs/checks.md](docs/checks.md) —— 8 项检查规则详解

## 许可证

MIT —— 见 [LICENSE](LICENSE)。
