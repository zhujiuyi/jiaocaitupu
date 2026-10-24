# tests/ · 回归验收脚本

一条命令跑完整轮验收：起静态服务器 + headless Chrome，用 CDP 驱动页面，检查功能、数据、样式。

## 前置

| 依赖 | 说明 |
|---|---|
| Node 18+ | 脚本用原生 `fetch` 和内置 `WebSocket`，不需要装任何 npm 包 |
| Python 3 | 起静态服务器（`python -m http.server`） |
| Chrome | 默认找 `C:\Program Files\Google\Chrome\Application\chrome.exe`；其它位置用环境变量 `CNM_CHROME` 指定 |

## 跑

在**仓库根目录**执行：

```powershell
pwsh -File tests/verify.ps1              # 全部（功能 + 数据 + 样式）
pwsh -File tests/verify.ps1 -StyleOnly   # 只跑样式断言
```

脚本自己起服务器和 Chrome，结束时只清理自己起的进程（按 `--user-data-dir` 里的标记匹配），不会杀你平时开着的 Chrome。

## 各脚本做什么

| 脚本 | 检查内容 |
|---|---|
| `audit.mjs` | 页面结构与数据：控制台报错、网络失败、关键 DOM 存在、统计数字 |
| `probe.mjs` | 横向溢出：在 390 / 768 / 1280 三个视口下检查 `scrollWidth == clientWidth` |
| `interact.mjs` | 交互流程：年级折叠、搜索过滤、选中知识点、诊断出题与作答 |
| `final.mjs` | 诊断端到端：建档案 → 答题 → 结果页 → 路径图 / 导出 / 打印 |
| `style-audit.mjs` | 对比度（WCAG AA）、触控尺寸 ≥44px、页脚状态 |
| `styles.mjs` | 具体样式断言：页脚移除、年级行标记、移动端导航高度、大标题不拆行 |
| `shots.mjs` | 生成 README 用的 26 张截图，写入仓库根 `screenshots/` |
| `stats.mjs` | 统计 `data/*.json` 的真实数字（README 里的数字来源，不手抄） |

`shots.mjs` 和 `stats.mjs` 不参与 `verify.ps1`，单独跑：

```powershell
# 截图（需要先自己起服务器和 Chrome，或改 BASE/CDP）
node tests/stats.mjs     # 只读 data/，随时可跑
node tests/shots.mjs     # 需要 127.0.0.1:8770 和 CDP :9333
```

## 注意

- **端口固定**：服务器 8770、CDP 9333。被占用时脚本会失败，先清掉占用的进程。
- **`final.mjs` 会建一个测试孩子档案**：因为诊断现在要求先选孩子。它跑在独立的 Chrome profile 里，不影响你日常用的浏览器数据。
- **Windows only**：`verify.ps1` 是 PowerShell 脚本。`.mjs` 本身跨平台，Linux / macOS 上手动起服务器和 Chrome 后可以直接 `node` 跑。

## 设计文档

`DESIGN-children-mistakes.md` 是「孩子档案 + 错题本」的设计记录（数据模型、抽题算法、移出规则、边界情况）。功能已实现，留作后续调整规则时的参考。
