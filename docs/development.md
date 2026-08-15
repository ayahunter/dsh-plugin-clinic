# 开发指南

> 面向 dsh-plugin-clinic 的贡献者。规范与纪律见 [AGENTS.md](../AGENTS.md)；
> 设计决策记录在本地 `docs/PLAN.md`（内部工作文档，不随仓库发布）。

## 环境

- Node `^22.19 || >=24`（与 DSH 一致；构建在 Node 24 上验证）
- pnpm（本仓库使用 pnpm 安装与管理 lockfile）

## 命令

```sh
pnpm install          # 安装依赖
pnpm run typecheck    # tsc --noEmit（含测试）
pnpm run test         # vitest 单测 + 组合测试 + 组件测试
pnpm run test:coverage
pnpm run build        # tsc 产出 lib/（Host 半）+ tsdown 产出 lib/client.js（Client 半）
pnpm run clean
```

## 构建产物契约

两步构建，两个产物：

1. **Host 半**：`tsc -p tsconfig.build.json` 把 `src/` 直出为 ESM 到 `lib/`
   （`lib/index.js`、`lib/invariant.js`、`lib/types.js` + 同名 `.d.ts`）。
   Node 直接运行 ESM，依赖经 node_modules 解析——不做 bundle。
2. **Client 半**：`tsdown.config.ts` 把 `src/client/index.ts` 打成
   `lib/client.js` —— `window.__ModuleLoader__.load({ id, factory })` 闭包工厂格式，
   这是官方 web 加载器的契约（复刻自 `packages/client/tsdown.client.ts` 配方：
   banner/intro/footer、平台模块 external 表、`process.env` 替换）。
   **Client 半不得 value-import 平台模块表之外的 `@deepseek-ai/*`**（跨插件运行时身份
   泄漏）；需要官方 client 类型时用 `import type`（构建期擦除）。

`prepare` 脚本与 `build` 相同，保证 git 安装（源码形态）也能自包含构建。

## 测试

三层，对应三条纪律（AGENTS.md）：

| 层 | 范围 | 方式 |
|---|---|---|
| engine 单测 | 8 检查器 + report 折叠 + inventory 解析 | 纯函数 + fixture（好坏样例）；engine 覆盖率目标 100% |
| 组合测试 | 工具注册、路由、Host 组装 | 构造测试 DSH_HOME（好坏 profile fixture）+ 真实 Loader 启动（cordis.yml 加载本插件），断言工具可调用、路由可访问、Host 头防护生效 |
| 组件测试 | ClinicTab | props 直喂（summary/严重性着色/空态/失败态+重试），组件不碰 ctx |

新增检查器必须同时提供：检查器单测（好坏 fixture 对）+ `docs/checks.md` 条目 +
组合测试断言（如适用）。

## 目录纪律

- `src/engine/` 纯函数：新检查器不得自行读盘或拿 ctx；输入先由 `inventory.ts` 收集。
- `src/client/` 组件只经 props 拿数据；浏览器 half 的 apply 只做 slots/locale 注册。
- 相对导入显式 `.ts`；类型导入用 `import type`。

## 发布

1. 全绿：`pnpm run typecheck && pnpm run test && pnpm run build`；
2. 确认 npm 名称可用（`npm view dsh-plugin-clinic` 应 404）；
3. `pnpm publish`（产物含 `lib/` 与 `cordis.patch.yml`；`files` 白名单见 package.json）；
4. GitHub 仓库打 `dsh-plugin` topic（官方生态入口，CONTRIBUTING 指定）；
5. 提交到社区清单（awesome-dsh-plugin / Oh-My-DSH 等）。

版本节奏：0.1.x 修复与文档；0.2.x 新检查（npm 在线、deprecated、severity 配置）；
0.3.x 修复建议与 doctor 集成。破坏性变更（报告契约/工具参数）升 minor 并在
CHANGELOG 声明。

## 验收清单（真实环境，发布前必须过）

1. `dsh plugin --profile web add dsh-plugin-clinic` 后重启无错；
2. 设置 → 插件 → 出现"体检"tab，显示当前 profile 插件健康度；
3. 人为破坏（往 profile dependencies 塞不存在的 bundle）→ 面板标红 critical、
   `plugin_health` 报告含对应 finding；
4. headless profile 下 `plugin_health` 可用；
5. `dsh plugin remove` 后无残留（工具/路由/tab 随 fiber 撤销）；
6. `curl http://127.0.0.1:<port>/clinic/health` 返回 200；伪造 Host 头返回 403。

## 已知构建边界

- tsdown 版本以 `package.json` 锁定为准；升级需重跑构建验证 client.js 格式不变。
- 官方 0.0.1-rc 系列 API 会破坏性演进：升级 peer 依赖后重跑全部测试；
  发布后用 CI 兼容矩阵（多 DSH 版本）跟踪漂移。
