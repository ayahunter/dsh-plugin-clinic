# 使用指南

> 面向使用 dsh-plugin-clinic 的用户。安装与配置速览见 [README](../README.zh.md)；
> 检查规则细节见 [checks.md](checks.md)。

## 安装

```sh
dsh plugin --profile web add dsh-plugin-clinic
```

- 从 npm 安装的是预构建产物，无需任何构建权限。
- 从 GitHub 安装（`github:ayahunter/dsh-plugin-clinic`）会拿到源码，`prepare` 脚本负责构建；
  pnpm ≥10 会拒绝运行 git 依赖的 `prepare`，第一次 `add` 会失败并打印需要允许的包名——
  把它加入 profile 的 `pnpm-workspace.yaml` `allowBuilds` 后重试。允许构建意味着
  **允许该包代码在安装时于沙箱外执行**，只对信任的源这样做，并建议固定 commit。

安装后重启 profile（`dsh plugin` 会提示，或手动重启 dsh）。

### 更新

```sh
dsh plugin --profile web update dsh-plugin-clinic
```

`update` 转发 `pnpm update`：在已保存的 semver 范围（`add` 默认写入 `^0.1.0`）内
升到最新（当前 0.1.1）。插件**不会自动更新**；更新后重启 profile 生效。

## 三个使用入口

### 1. 会话内工具 `plugin_health`

在任意会话中让 agent 自检：

```
体检一下我的插件
```

或直接调用工具：

| 参数 | 类型 | 说明 |
|---|---|---|
| `profiles` | string[]（可选） | 限定 profile 目录名；缺省全部 |
| `severity` | `all` / `warning` / `critical`（可选） | 只保留不低于该级别的发现；缺省 `all` |
| `details` | boolean（可选） | `false`（默认）只返回计数；`true` 返回每条发现 |

工具返回 `ClinicReport` JSON（契约见下），并把 markdown 摘要渲染给模型。
报告会进入会话日志——这正是"让 agent 自检"的设计意图，所以证据字段刻意最小化
（只有包名/版本/脚本名/错误信息，绝无脚本正文或源码内容）。

### 2. Web 体检面板

设置 → 插件 → **体检** tab：

- 首屏是汇总条（各严重性计数）+ 按 profile 分组的插件卡片；
- 插件卡片按最高严重性着色：红 = critical、黄 = warning、灰 = 正常；
- 展开卡片查看该插件的全部发现与证据；失败态可重试。

### 3. JSON 报告（脚本/CI）

```sh
curl http://127.0.0.1:<port>/clinic/health            # 完整报告
curl http://127.0.0.1:<port>/clinic/health/summary    # 摘要
```

报告契约 `schemaVersion: 1`：

```jsonc
{
  "schemaVersion": 1,
  "generatedAt": "2026-08-16T12:00:00.000Z",
  "environment": {
    "dshVersion": "0.1.0-rc.6",
    "cordisVersion": "4.0.1",
    "nodeVersion": "v24.19.0",
    "platform": "win32",
    "dshHome": "C:\\Users\\me\\.dsh"
  },
  "profiles": [
    {
      "profile": "web",
      "manifestPath": "C:\\Users\\me\\.dsh\\profiles\\web\\package.json",
      "plugins": [
        {
          "plugin": "dsh-plugin-x",
          "version": "0.1.0",
          "source": "bundle",            // bundle | dependency | loader-only
          "findings": [
            {
              "checkId": "install-scripts",
              "severity": "warning",
              "message": "\"dsh-plugin-x\" declares an install-time script \"postinstall\"",
              "evidence": "postinstall scripts run package code outside the agent sandbox; review the package source before allowing it"
            }
          ]
        }
      ],
      "profileFindings": [],             // patch-health / duplicate 等 profile 级发现
      "summary": { "critical": 0, "warning": 1, "info": 1 },
      "checks": [ { "id": "load-health", "ran": true } ]
    }
  ]
}
```

## 配置

在 profile 的 `cordis.patch.yml` 中给 clinic 行加 `config`（全部有默认值）：

| 字段 | 默认 | 说明 |
|---|---|---|
| `profiles` | `[]`（全部） | 限定体检的 profile 目录名 |
| `enableTool` | `true` | 注册 `plugin_health` 工具 |
| `enableWebRoute` | `true` | 存在 webServer 时注册 `/clinic` 路由 |
| `webRoutePrefix` | `'/clinic'` | 路由前缀 |
| `includeHomePatches` | `true` | 把 home 层 `cordis.patch.yml` 纳入 patch-health 检查 |

例如只体检 `headless` profile 并关掉路由：

```yaml
- id: clinic
  name: 'dsh-plugin-clinic'
  config:
    profiles: [headless]
    enableWebRoute: false
```

## 常见问题

**面板显示失败/空白？** 先确认 profile 里有 webServer（headless 无路由，面板只出现在
Web profile）；再确认 `enableWebRoute: true`；面板失败态可点重试。

**headless profile 下工具可用吗？** 可用。工具不依赖 webServer；只是没有面板和路由。

**报告里某个插件标红但 boot 正常？** 兼容性/脚本风险是预警不是事实错误；
`install-scripts` 表示该包安装期会执行代码（publish.md 语义），不代表它已被执行。

**如何看完整发现？** 工具加 `details: true`；面板展开卡片。

**卸载？** `dsh plugin --profile web remove dsh-plugin-clinic`。工具、路由、面板随
fiber 卸载全部撤销，无残留。
