# AGENTS.md

dsh-plugin-clinic 是 DeepSeek Harness（DSH）生态的**只读插件诊所**：对 `$DSH_HOME/profiles/*`
中已安装插件集合做健康体检，交付给模型工具（`plugin_health`）、Web 体检面板和纯 JSON 报告。
产品与架构决策见 [docs/PLAN.md](docs/PLAN.md)；当前进度见 [docs/STATUS.md](docs/STATUS.md)。

## 核心原则（第一性原理，不可违背）

- **只读第一原则**：诊断不修东西。任何检查、工具、路由、面板都不得写入
  profile、manifest、配置或会话外状态。新增写入能力必须先改 PLAN 并说明理由。
- **引擎纯函数**：`src/engine/` 无 I/O、无 ctx；一切文件与模块解析都在
  `engine/inventory.ts` 收集后经参数注入检查器。新增检查器不得自行读盘。
- **模型可见 ⟺ 可记录**：工具结果会进会话日志。evidence 只含元数据
  （包名/版本/脚本名/错误信息），**绝不**包含脚本正文、源码内容、凭据或环境变量值。
- **不重复造轮子**：源码级安全扫描归 `dsh-plugin-doctor`，会话内单目录审计归
  `dsh-plugin-audit`，本仓库做"已安装集合的持续体检"。新增检查前先对照三者边界。

## 仓库布局

```
src/
  index.ts         Host apply：组装引擎 + 工具 + 路由 + invariant
  types.ts         公开类型与报告 JSON 契约（schemaVersion 1）
  engine/          纯函数诊断引擎（inventory → checks → report）
  tool.ts          plugin_health 模型工具注册
  route.ts         /clinic HTTP 路由（webServer，Host 头防护）
  invariant.ts     ./invariant 伴生导出
  client/          browser half：Settings 体检 tab
tests/             vitest：engine 单测 + 组合测试 + 组件测试
docs/              PLAN（规划）、STATUS（进度）、usage/development/checks（用户与开发文档）
```

## 命令

```sh
pnpm install         # 安装依赖
pnpm run build       # tsc 编译 lib/ + tsdown 产出 lib/client.js
pnpm run test        # vitest 单元与组合测试
pnpm run test:coverage
pnpm run typecheck   # tsc --noEmit
pnpm run clean
```

发布：`pnpm publish`（先 `pnpm run build`；`prepare` 脚本保证 git 安装也可构建）。
构建产物契约：Host 半 = tsc 直出 `lib/`（ESM）；Client 半 = tsdown 闭包工厂
`lib/client.js`（`window.__ModuleLoader__.load` 格式，见 [docs/development.md](docs/development.md)）。

## 规范

- **TypeScript strict 全开**（`strict`/`noUncheckedIndexedAccess`/`exactOptionalPropertyTypes`/
  `verbatimModuleSyntax`）；类型导入用 `import type`；跨模块相对导入显式 `.ts`。
- **测试即行为文档**：engine 检查器一好一坏 fixture 对；组合测试走真实 Loader 启动
  （测试 DSH_HOME fixture）；组件测试 props 直喂（不碰 ctx）。
- **文档与代码同步**：改动 Config、报告 schema、检查规则、工具 schema、路由契约时，
  同步更新 `docs/` 对应文档与 README；README 必须保留官方规范的
  `Model Experience` 与 `Known Limitations and Deferred Work` 章节。
- **双语**：`README.md`（英文）与 `README.zh.md`（中文）互为镜像，同步更新；
  docs/ 中文为主。
- **严重级别纪律**：`critical` 只用于 boot 失败级或安装期执行风险；瞬时/兼容/维护信号
  一律 `warning`；来源标注等纯信息用 `info`。
- **外部协作纪律**：Client 半不得 value-import 平台模块表之外的 `@deepseek-ai/*`
  （跨插件运行时身份泄漏）；协作走 cordis 服务（`slots`/`locale`/`tools`）或本仓库路由。

## 编辑这些文件

- 改产品/架构方向 → 先改 `docs/PLAN.md`（它优先于代码）。
- 改检查规则 → 同步 `docs/checks.md` 与 `src/engine/checks.ts` 与测试。
- 改公开契约（报告 schema/工具参数/路由/Config）→ 同步 `src/types.ts`、README、
  `docs/usage.md`。
- 进度变动 → 更新 `docs/STATUS.md`。

## 发布检查清单

1. `pnpm run typecheck && pnpm run test && pnpm run build` 全绿；
2. `docs/STATUS.md` 与 README 与当前代码一致；
3. 真实环境验收（见 `docs/development.md` §验收清单）通过；
4. `dsh-plugin-clinic` 名称未被占用；`pnpm publish` 产物含 `lib/` 与 `cordis.patch.yml`；
5. 提交 GitHub 并打 `dsh-plugin` topic。
