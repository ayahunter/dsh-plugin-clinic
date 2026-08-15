# dsh-plugin-clinic 实施规划

> 状态：规划定稿（2026-08-16）。目标读者：实施者。本文档决策完备——实施时无需再做设计决策；
> 遇到与本文冲突的事实，先修订本文再改代码。
>
> 前置调研：`D:\agentwork\code\deepseek-harness\docs\research\2026-08-16-dsh-community-plugin-gap-research.md`
> 与 `research/dsh-plugin-ecosystem-report.md`（生态全览、竞品核查 dsh-eval/doctor/audit 的证据链）。

---

## 1. 产品定义

**一句话**：装进 DSH 后，对 `$DSH_HOME/profiles/*` 中已安装插件集合做只读健康体检，
通过三个出口交付——模型工具（`plugin_health`）、Web 体检面板、可机读 JSON 报告。

**用户故事**：

1. 用户从 GitHub 装了 5 个插件，改了几个 patch，某天 boot 报错或行为诡异 →
   打开"设置 → 插件 → 体检"，一眼看到哪个插件 critical、哪处 patch 引用断裂、哪个包
   有安装脚本风险、哪个插件和当前 DSH 版本不兼容。
2. 用户在会话里说"体检一下我的插件" → `plugin_health` 返回结构化报告，agent 据此
   给出修复建议（例如"`dsh-plugin-x` 的 peer `@deepseek-ai/dsh-session` 未满足，
   建议 `dsh plugin --profile web add @deepseek-ai/dsh-session`"）。
3. 用户维护一个多 profile 的机器（web / headless / eval）→ 面板一次看全所有 profile。

**非目标（v1）**：不做安装/卸载/启停（管理类红海）；不做源码级安全扫描（doctor 已做，
v2 可选集成）；不做 npm 在线检查（v2）；不做修复动作（v1 只报告，建议由 agent/用户执行）。

## 2. 第一性原理推导

**需求本质**：DSH 的"一切皆插件"把系统稳定性风险分散到了用户可自由组合的配置层，
而 DSH 没有为"已安装集合"提供任何健康视图——官方 `pluginInventory` 只给 Loader 树快照
（id/specifier/enabled/phase），无 provenance、无依赖分析、无风险信号（官方 UI 自己也
声明这是 Known Limitation）。用户对"我的环境是否健康"没有任何可观测手段。

**推论链**：

1. 健康 = 可观测事实的集合，全部位于本机：
   - 加载是否成功 → `ctx.loader.entries()` 的 phase（官方同源数据）
   - 集合与声明是否一致 → `$DSH_HOME/profiles/<name>/package.json` 的
     `dsh.profile.bundles` 有序列表 + `dependencies`
   - 依赖是否满足 → 解析到的 `node_modules/<pkg>/package.json` peerDependencies
   - 是否兼容当前运行时 → 包声明的 engines/peer 区间 vs 实际 Node/Cordis/DSH 版本
   - 是否有安装期执行风险 → `scripts` 中的 preinstall/install/postinstall/prepare
   - 是否有重复 → bundles 列表与 loader specifier 归一化比对
   - patch 是否完整 → 各 bundle 的 `cordis.patch.yml` 与 profile/home 层 patch 的
     row 引用可解析性
2. 交付出口按消费方分：模型（工具）要结构化 + 摘要优先；人（面板）要可视化 + 可展开；
   自动化（CI/脚本）要纯 JSON。三个出口共享同一个只读引擎与同一份报告 schema。
3. 只读是第一原则：诊断不修东西，才能安全地常驻、被模型调用、被面板轮询。
4. 不引入外部状态：报告 = 即时快照（generatedAt），无缓存、无历史、无订阅——
   官方 pluginInventory 同款取舍，避免一致性成本。

## 3. 竞品边界（差异化断言）

| 现有者 | 视角 | 我们不同在哪 |
|---|---|---|
| 官方 `pluginInventory` + 官方"插件列表"tab | Loader 树快照 | 我们做诊断（8 项检查），不只枚举；官方 UI 只显示 phase，无风险/依赖/兼容信息 |
| `dsh-plugin-doctor`（外部 CLI） | 作者/CI 在**装之前**体检单个 bundle | 我们装**进 DSH 之后**体检**集合**；我们面向用户与 agent，它面向发布流水线 |
| `dsh-plugin-audit`（会话内工具） | 单个目录的**安全**审计 + 运行时哨兵 | 我们覆盖**全部已装插件**的多维健康（含兼容/依赖/patch），不做运行时拦截 |
| 各 marketplace/hub/manager | 安装、启停、商店 | 我们只诊断，不做管理（刻意避开红海） |

重叠风险与应对：doctor/audit 都是 0.1.x 早期，若它们后续扩展为"集合体检"，我们的
护城河是面板 + 模型工具 + 只读常驻形态；v2 可选集成 doctor CLI（用户装了才调用）而非
重造源码扫描。

## 4. 架构设计

### 4.1 包拓扑

单 npm 包 `dsh-plugin-clinic`（发布前检查名称占用，备选 `dsh-plugin-health`）。
一个包 = Host half（诊断引擎 + 工具 + 路由）+ Client half（面板）+ invariant 伴生。
不分多包：单一用途插件保持一个包（官方 adding-a-package 规则）；引擎是纯函数目录而非
独立包，因为当前只有这一个消费方。

### 4.2 依赖（peerDependencies + devDependencies，全部已确认在 npm 发布）

| 包 | 用途 |
|---|---|
| `@deepseek-ai/cordis` ^4.0.1 | 插件框架 |
| `@deepseek-ai/dsh-tools` ^0.0.1-rc.1 | `defineTool` 注册工具 |
| `@deepseek-ai/dsh-home-paths` ^0.0.1-rc.3 | `resolveDshHome` / `dshHomePath` |
| `@deepseek-ai/dsh-invariants` ^0.0.1-rc.1 | `ctx.invariants` 注册伴生 |
| `@deepseek-ai/dsh-host-webserver` ^0.0.1-rc.1 | `ctx.webServer` 路由（仅类型/可选注入） |
| Client 侧（仅 devDependencies 编译 + peerDependencies 类型）：`@deepseek-ai/dsh-client-runtime`、`dsh-client-ui-settings`、`dsh-client-ui-slots`、`dsh-client-locale` | 面板注册与 props 类型 |

运行时依赖：零（`js-yaml` 用于 patch 解析，作为普通 dependency）。
peer 范围策略：跟随 dsh-eval 先例（宽松 ^ 范围）；CI 兼容矩阵对齐 `dsh-plugin-doctor`
做法（多 DSH 版本实测）。

### 4.3 Host 侧模块

```
apply(ctx)
├── Config 校验（zod，standard-schema 自动校验）
├── 引擎实例化（纯函数，无状态）
├── ctx.tools.register(defineTool(plugin_health))     # enableTool !== false 时
├── ctx.webServer.register(route)                     # enableWebRoute && ctx.get('webServer')
└── ctx.invariants.register('dsh-plugin-clinic', ...) # invariant.ts 伴生
```

**engine/ 层纪律**：所有检查器是 `(input) => Finding[]` 纯函数；输入收集（loader 快照、
profile manifest 读取、包解析）在 `inventory.ts` 单独完成，通过参数注入检查器。
这保证检查器可单测、报告可序列化、无隐藏 I/O。

**报告组装**（report.ts）：输入收集 → 逐检查器 → 折叠成 ProfileReport → 汇总
SeverityCounts。严重性优先级 critical > warning > info（多发现取最高）。

### 4.4 Client 侧

完全照抄官方 `ui-settings-plugin-inventory` 的注册形态（已验证源码）：

```
browser apply(ctx)
├── ctx.locale.register('settings.clinic', { zh, en })
├── ctx.slots.inject('settings.plugins.tab', () => ctx.slots.register({
│     name: 'settings.plugins.tab', id: 'clinic', order: 20,
│     label: () => t('tab'), locale: NS, inject: injected,
│   }, ClinicTab))
└── injected = { summary: fetch(`${prefix}/health/summary`), detail: fetch(...) }
```

- 与官方 'all' tab（order 10）并列，挂在官方 Plugins 设置区——零侵入。
- 组件数据全部经 inject 回调（fetch），组件不碰 ctx（client 规范）。
- 首屏 summary 条 + profile 切换；展开加载详情；加载/空/失败态本地管理，可重试。

### 4.5 数据流

```
[磁盘] profile manifest / node_modules / patch 文件
   │  (inventory.ts 读取)
[Host] engine 检查器 → ClinicReport（纯 JSON）
   ├──→ ctx.tools（plugin_health：canonical value = Report，render = markdown 摘要）
   └──→ ctx.webServer（GET /clinic/health → Report；/clinic/health/summary → 摘要）
            │ (浏览器同源 fetch)
[Client] ClinicTab 渲染
```

## 5. 检查项规格（v1，8 项）

每条：`checkId` / 输入 / 规则 / 严重级 / evidence。

| # | checkId | 规则 | 严重级 | evidence |
|---|---|---|---|---|
| 1 | `load-health` | Loader entry phase 为 `failed` | critical | entry id、specifier、phase |
| 2 | `load-health` | phase 为 `pending`/`loading`/`unloading`，或 enabled 但无 root fiber | warning | 同上 |
| 3 | `bundle-manifest` | `dsh.profile.bundles` 列出的包无法解析（profile deps 与 dsh 安装均无） | critical | bundle 名、解析尝试 |
| 4 | `bundle-manifest` | 可解析但缺 `dsh.bundle.patch` 声明 / patch 文件缺失 / patch YAML 解析失败 | critical | 包名、文件、错误 |
| 5 | `peer-deps` | 必需 peerDependency 未解析或解析版本不满足 semver 区间 | warning | peer 名、要求区间、实际/缺失 |
| 6 | `peer-deps` | 可选 peer（`peerDependenciesMeta.optional`）缺失 | info | 同上 |
| 7 | `runtime-compat` | `engines.node` 不满足 `process.version`；`cordis` peer 区间不含实际版本；`dsh` 兼容区间（若有）不含实际版本 | warning | 要求 vs 实际 |
| 8 | `install-scripts` | scripts 含 `preinstall`/`install`/`postinstall`/`prepare` | warning | 脚本名（**不含脚本内容**） |
| 9 | `duplicate` | 同一包名在 bundles 列表或 loader 中出现多次 | warning | 包名、出现位置 |
| 10 | `patch-health` | patch row 引用的包名无法解析 | critical | 文件名、row |
| 11 | `patch-health` | id-targeted patch 指向不存在的 entry | warning | 文件名、id |
| 12 | `provenance` | 来源标注（in-box/out-of-tree、所属 bundle 层） | info | 来源字符串 |

决策说明：

- **install-scripts 只报脚本名不报内容**：工具结果会进会话日志（模型可见 ⟺ 已记录），
  任意脚本文本不应被持久化；脚本名足以触发人工检查。
- **npm 在线检查（deprecated/更新）不入 v1**：离线可用、无网络依赖、速度快；
  v2 以可配置 + 缓存方式加入。
- **不做源码级安全扫描**：doctor 已覆盖，重复造轮子违背生态分工；v2 可选检测到
  `dsh-plugin-doctor` CLI 时调用它并折叠其结果。

## 6. 公开 API 与 schema

### 6.1 报告 JSON（`schemaVersion: 1`）

```ts
interface ClinicReport {
  schemaVersion: 1
  generatedAt: string            // ISO 8601
  environment: {
    dshVersion: string | null    // 解析 @deepseek-ai/dsh-base 的 version
    cordisVersion: string | null // 解析 @deepseek-ai/cordis 的 version
    nodeVersion: string          // process.version
    platform: string
    dshHome: string
  }
  profiles: ProfileReport[]
}

interface ProfileReport {
  profile: string                // profiles 目录名
  manifestPath: string
  plugins: PluginReport[]
  summary: { critical: number; warning: number; info: number }
  checks: { id: string; ran: boolean; note?: string }[]
}

interface PluginReport {
  plugin: string                 // 包名
  version: string | null
  source: 'bundle' | 'dependency' | 'loader-only'
  findings: Finding[]
}

interface Finding {
  checkId: string
  severity: 'critical' | 'warning' | 'info'
  message: string
  evidence?: string
}
```

### 6.2 模型工具 `plugin_health`

- 参数：`profiles?: string[]`（限定；缺省全部）、`severity?: 'all' | 'warning' | 'critical'`
  （过滤；缺省 all）、`details?: boolean`（缺省 false → 只返回 summary 与 findings 计数，
  避免大报告冲爆模型上下文；true → 完整 findings）
- canonical value：`ClinicReport`（JSON）
- render：markdown——按 profile 的严重性表格 + 每插件一行（名/版本/最高严重级/发现数）
- UI 卡片：`generic`（title "插件体检"）

### 6.3 HTTP 端点（webServer 命名路由，prefix）

- `GET <prefix>/health?profile=<name>` → `ClinicReport`
- `GET <prefix>/health/summary` → 去 findings 的轻量版（面板首屏）
- 防护：Host 头必须为 loopback authority（`127.0.0.1`/`localhost`/`[::1]`，允许端口），
  否则 403——模仿官方 connection fence 精神的最小防护；明确这不是认证。
- 路由冲突：prefix 默认 `/clinic`；与官方路由表冲突时 loud fail（webServer 语义）。

### 6.4 Config（cordis.yml 可配置，全部有默认值）

```ts
interface Config {
  profiles?: string[]     // 限定体检的 profile 目录名；缺省 = 扫描全部
  enableTool?: boolean    // 缺省 true
  enableWebRoute?: boolean// 缺省 true
  webRoutePrefix?: string // 缺省 '/clinic'
  includeHomePatches?: boolean // 缺省 true（home 层 cordis.patch.yml 纳入 patch-health）
}
```

## 7. 边界情况与失败模式

| 情况 | 行为 |
|---|---|
| headless profile（无 webServer） | `enableWebRoute` 时 `ctx.get('webServer')` 为 undefined → 跳过路由注册并记 info 日志；工具照常可用 |
| profile manifest 损坏/不可读 | 该 profile 记为 critical finding（含错误），继续体检其他 profile；不中断整个报告 |
| 某包 node_modules 解析失败 | 该插件 `version: null` + 对应 finding 带解析错误 |
| loader 快照瞬时态（pending 等） | warning + 说明"瞬时态，可能随后稳定"；不误报 critical |
| 报告过大（数百插件） | 工具默认 summary 级（`details:false`）；HTTP 无此限制（面板按需展开） |
| 并发请求 | 引擎无状态、只读，天然并发安全；每次请求独立快照 |
| patch 层冲突（webServer 路由重名） | loud fail（官方语义，属配置错误） |
| 工具被禁用（enableTool:false） | 不注册工具，其余照常 |
| 当前 profile 名不可得 | 官方无 API 暴露当前 profile → v1 扫描全部 profiles（配置可限定）；从 process.argv 提取 `--profile` 仅用于 UI 高亮（best-effort，非权威） |

## 8. 安全与隐私

- 全程只读：无任何写操作；报告数据全部来自本机插件元数据。
- evidence 纪律：脚本只报名字、patch 只报错误信息（可含路径，本机场景可接受）、
  绝不读取/记录凭据文件、环境变量值或源码内容。
- 模型可见性：工具返回的报告进入会话日志——设计上即接受（这正是"让 agent 自检"的
  卖点）；因此 evidence 字段刻意最小化。
- 路由：仅 loopback Host 头放行；v1 不暴露 LAN（与官方 web 姿态一致）。

## 9. 测试与验收

### 9.1 单测（engine 层，vitest）

- 每个检查器：好/坏 fixture 对（fake manifest / fake patch / fake loader 快照）。
- report.ts：严重性优先级、计数折叠、空集合。
- 覆盖率目标：engine 层 100%（官方 gate 精神）。

### 9.2 组合测试（REAL composition，官方 testing policy 精神）

- 构造测试 DSH_HOME：两个 profile（一个好、一个故意坏：不存在的 bundle、断裂的 patch、
  带 postinstall 的假包、peer 缺失的假包）。
- 通过 Loader 启动真实组合（cordis.yml 含本插件 + 假 fixtures）→ 断言：
  1. `plugin_health` 工具可调用且返回预期 critical/warning；
  2. 路由存在且 `GET /clinic/health` 返回 200 + 正确 JSON；坏 Host 头返回 403；
  3. headless 组合（无 webServer）不报错、工具可用。

### 9.3 Client 组件测试

- props 直喂（官方 client 规范）：summary 渲染、严重性着色、空态、失败态+重试。

### 9.4 验收清单（人工，真实环境）

1. `dsh plugin --profile web add dsh-plugin-clinic`（npm 或 git+prepare）→ 重启无错；
2. 设置 → 插件 → 出现"体检"tab，显示当前 profile 插件列表与健康度；
3. 人为破坏（往 profile dependencies 塞不存在的 bundle）→ 面板标红 critical、
   `plugin_health` 报告含对应 finding；
4. headless profile 下 `plugin_health` 可用；
5. 卸载（`dsh plugin remove`）无残留（工具/路由/tab 全部随 fiber 撤销）。

## 10. 发布与里程碑

| 里程碑 | 内容 | 出口 |
|---|---|---|
| v0.1（MVP） | 引擎 8 检查项 + 工具 + 路由 + 面板 + invariant + 全测试 | npm 发布 + GitHub repo + `dsh-plugin` topic + 提交 awesome 清单 |
| v0.2 | npm 在线检查（deprecated/更新，可配置+缓存）、severity 过滤配置、更多风险信号 | 同上 |
| v0.3 | 修复建议（dry-run 变更方案输出）、doctor CLI 可选集成、体检快照对比 | 同上 |

发布规范（官方 publish.md）：npm 发布带 `lib/` 构建产物（`pnpm publish` 时构建）；
git 安装需 `prepare` 脚本自包含构建（turtle-ui 模式）+ 用户 allowBuilds；README 必须含
官方规范的 Model Experience 与 Known Limitations 章节；双语文档。

## 11. 明确假设与风险

| 假设/风险 | 等级 | 应对 |
|---|---|---|
| 外部 Client half 能被官方 web GUI 加载（dsh.client + exports["./client"] + modules 扫描 enabled entries） | 中 | 社区 Web GUI 插件已有先例；v0.1 里程碑 gate 1 即在真实 web profile 验证；失败则降级为"面板改由独立 HTML 页 + 路由提供" |
| 官方 0.0.1-rc API 频繁破坏性变更 | 高 | 宽松 peer 范围；CI 多版本兼容矩阵（doctor 先例）；随官方 rc 迭代更新 |
| Electron 桌面壳下浏览器 fetch 走 IPC bridge，自定义路由可能不可达 | 中 | v1 面向官方 web GUI（浏览器）；桌面壳兼容性列入 Known Limitations，验证后决定 |
| `dsh-plugin-clinic` npm 名被占 | 低 | 发布前检查；备选 `dsh-plugin-health` |
| pnpm profile node_modules 布局（symlink）可读 | 低 | 常规文件读；组合测试覆盖 |
| 面板与官方 'all' tab 数据重复（都显示插件列表） | 低 | 刻意错位：官方 tab 显示 Loader 状态，我们显示诊断结论；UI 文案区分 |

## 12. 实施顺序（首个里程碑内）

1. 联网核对官方 `dsh-external/plugin-template`（本规划基于本地源码推导，模板可能补充
   构建/发布细节）→ 修订本文件；
2. 仓库骨架：package.json / tsconfig / tsdown / cordis.patch.yml / LICENSE(MIT)；
3. `src/types.ts` + engine（inventory → 8 检查器 → report）+ 单测；
4. `src/tool.ts` + 组合测试（工具路径）；
5. `src/route.ts` + 组合测试（路由路径 + Host 头防护）；
6. `src/client/`（tab 注册 + 组件）+ 组件测试；
7. `src/invariant.ts`（空安装器：`No runtime invariant:` 说明——引擎只读性由组合测试
   观察，无事件协议可断言；待引擎获得持久状态时重访）；
8. README（双语，官方 Model Experience / Known Limitations 格式）+ LICENSE；
9. 真实环境验收清单执行 → 修复 → 发布 v0.1。

## 附录 A：官方机制锚点（本规划依据）

- `ctx.loader.entries()`：`packages/host/plugin-inventory`（官方同源投影，phase 语义）
- profile 布局与 `dsh.profile.bundles`：`docs/user/develop/basic/publish.md`、
  `packages/boot/app-boot/README.md`（Profiles 节）
- `resolveDshHome`：`packages/util/home-paths`（`$DSH_HOME` → `~/.dsh`）
- `settings.plugins.tab` 扩展点与注册形态：`packages/client/ui-settings-plugins`、
  `packages/client/ui-settings-plugin-inventory/src/client/index.ts`
- Client half 加载：`packages/client/modules`（扫描 enabled Loader entries 的 web
  dsh.client 包，解析 `exports["./client"]`）
- webServer 路由：`packages/host/webserver`（register / registerFallback / 冲突即 throw）
- 工具注册：`docs/cookbook/adding-a-tool.md`
- invariant：`packages/runtime-diagnostics/invariants`
- 发布：`docs/user/develop/basic/publish.md`（bundle/patch、npm 产物、git+prepare、
  allowBuilds 语义、turtle-ui 先例）
- 外部插件质量先例：`dsh-eval`（bundle patch + cmdline 契约 + invariant + 双语 README +
  Known Limitations）、`dsh-plugin-doctor`（CI 矩阵）、`dsh-plugin-audit`（工具 + 哨兵）

## 附录 B：未决事项（实施期确认）

- `dsh-external/plugin-template` 的确切骨架：**npm 无此包**；已以 dsh-eval 包结构 +
  官方规范为基准实施（见 STATUS）；联网后对照 GitHub 仓库修订差异。
- 官方 web GUI 对外部 Client half 的构建产物格式：**已解决**——复刻官方
  `packages/client/tsdown.client.ts` 配方（banner/intro/footer、平台模块 external 表、
  `process.env` 替换），`lib/client.js` 产物 head/tail 与官方格式一致；
  真实 web profile 加载验证是发布前 gate（STATUS）。
- npm 名称可用性：`dsh-plugin-clinic` **未被占用**（2026-08-16 核验）。
- **实施期新发现**（本规划未覆盖）：官方 npm 发布的 client 类型包 d.ts 带 `.ts`
  re-export，外部消费者不可解析（dsh-compact 等依赖也缺失）——已本地化类型面
  （`src/client/slot-types.ts`）；peer 依赖统一采用 `^0.1.0-rc.6` 版本体系
  （dsh-eval 先例），npm 可完整安装。
