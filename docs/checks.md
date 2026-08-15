# 检查项参考

> v1 的 8 项只读检查。规则在 `src/engine/checks.ts`；本文是权威文档，改规则必须同步两处。
> 严重级别纪律：`critical` 只用于 boot 失败级或安装期执行风险；瞬时/兼容/维护信号一律
> `warning`；来源标注等纯信息用 `info`。每项给出触发条件与 evidence 内容。

## 1. `load-health` — 加载健康（profile 级）

数据来源：当前 Loader 树快照（`ctx.loader.entries()`，跳过 group 行）。

| 规则 | 严重级 | evidence |
|---|---|---|
| Loader entry 的 root fiber phase 为 `failed` | critical | moduleName（分组键） |
| phase 为 `pending`/`loading`/`unloading`（瞬时态） | warning | moduleName |
| entry enabled 但没有 live root fiber | warning | moduleName |

发现的归属：按 moduleName 挂到对应插件；无 manifest 匹配的 entry 归为
`loader-only` 插件条目。

## 2. `bundle-manifest` — bundle 清单完整性（bundle 级）

数据来源：profile manifest 的 `dsh.profile.bundles` 列表 + 每个 bundle 的解析结果。

| 规则 | 严重级 | evidence |
|---|---|---|
| bundle 名无法从 profile 解析（不在 dependencies，也不在 dsh 安装） | critical | 解析失败信息 |
| 可解析但 package.json 不可读 | critical | — |
| 声明了 `dsh.bundle.patch` 但文件缺失 / YAML 解析失败 / 不是行数组 | critical | 具体错误 |

说明：bundle 不可解析意味着该 profile boot 时 Loader 会 fail loud——这是把
"boot 时才暴露"提前到"任何时刻可查"。

## 3. `peer-deps` — 依赖满足（每插件）

数据来源：插件 package.json 的 `peerDependencies` + `peerDependenciesMeta.optional`，
对照 profile 中实际解析的包版本。

| 规则 | 严重级 | evidence |
|---|---|---|
| 必需 peer 未安装（或解析失败） | warning | `required peer <range>` |
| 必需 peer 已装但版本不满足 semver 区间（`includePrerelease`） | warning | 要求区间 vs 实际版本 |
| 可选 peer 缺失 | info | `optional peer <range>` |

说明：peer 对照表 = profile 的 bundles + dependencies（含 in-box 包）。

## 4. `runtime-compat` — 版本兼容（每插件）

数据来源：插件声明的 `engines.node`、`peerDependencies["@deepseek-ai/cordis"]`、
`dsh.compatibility.dsh`（doctor 生态约定的可选声明），对照运行时实测版本
（`process.version`、解析安装的 `@deepseek-ai/cordis` 与 `@deepseek-ai/dsh-base`）。

| 规则 | 严重级 | evidence |
|---|---|---|
| `engines.node` 不满足当前 Node | warning | 要求 vs 实际 |
| cordis peer 区间不含实际版本 | warning | 要求 vs 实际 |
| dsh 兼容区间（若声明）不含实际版本 | warning | 要求 vs 实际 |

## 5. `install-scripts` — 安装脚本风险（每插件）

数据来源：`scripts` 中 `preinstall` / `install` / `postinstall` / `prepare` 的存在性。

| 规则 | 严重级 | evidence |
|---|---|---|
| 任一安装期脚本存在 | warning | 固定提示语：安装期脚本会在 agent 沙箱外执行包代码 |

纪律：**只报脚本名，绝不包含脚本内容**——工具结果会进会话日志，任意脚本文本不应被
持久化；脚本名足以触发人工审查。

## 6. `duplicate` — 重复（profile 级）

数据来源：bundles 列表 + loader 快照的 moduleName。

| 规则 | 严重级 | evidence |
|---|---|---|
| 同一包名在 bundles 列表出现多次 | warning | 出现次数 |
| 同一 moduleName 在 loader 树出现多次 | warning | 出现次数 |

## 7. `patch-health` — patch 引用完整性（profile 级）

数据来源：各 bundle 的 `dsh.bundle.patch`、profile 的 `cordis.patch.yml`、
home 层 `cordis.patch.yml`（`includeHomePatches` 开启时）。

| 规则 | 严重级 | evidence |
|---|---|---|
| patch 文件不可读 / YAML 解析失败 / 不是行数组 | critical | 具体错误 |
| `insert` 行引用的包名无法从 profile 解析 | critical | 行 id |
| `override` 行指向的 entry id 不在 loader 树 | warning | 提示"可能属于未加载的层" |

## 8. `provenance` — 来源标注（每插件，info）

| 规则 | 严重级 | evidence |
|---|---|---|
| 每个 bundle / dependency 插件的来源 | info | 解析位置或 `unresolved` |

## 折叠与过滤

- 插件卡片状态 = 该插件 findings 的最高严重级（`critical` > `warning` > `info`；
  空列表视为健康）。
- `summary` 计数 = 全部 findings（profile 级 + 插件级）按严重级折叠。
- 工具参数 `severity` 与报告按阈值过滤：`warning` 保留 critical+warning，
  `critical` 只保留 critical；`info` 是全量。
