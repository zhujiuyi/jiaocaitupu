# 一条命令复跑整轮验收（功能 + 数据 + 样式）。
#
#   pwsh -File tests/verify.ps1              # 全部
#   pwsh -File tests/verify.ps1 -StyleOnly   # 只看样式断言
#
# 会自动起静态服务器和 headless Chrome，结束后只清理自己起的进程。
# 前置：Node 18+、Python 3、Chrome（Windows 默认安装路径）

param([switch]$StyleOnly)

$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
# 站点根目录 = tests/ 的父目录（即仓库根）
$site = Split-Path -Parent $here
$chrome = if ($env:CNM_CHROME) { $env:CNM_CHROME } else { 'C:\Program Files\Google\Chrome\Application\chrome.exe' }
$port = 8770
$cdpPort = 9333
$profile = Join-Path $env:TEMP 'cnmath-verify-profile'

if (-not (Test-Path (Join-Path $site 'index.html'))) { throw "找不到站点根目录（本脚本应放在仓库根的 tests/ 下）：$site" }
if (-not (Test-Path $chrome)) { throw "找不到 Chrome：$chrome （可用环境变量 CNM_CHROME 指定）" }

$server = $null
$chromeStarted = $false
try {
    # 1) 静态服务器
    Write-Host "== 启动静态服务器 :$port ==" -ForegroundColor Cyan
    $server = Start-Process -FilePath 'python' `
        -ArgumentList @('-m','http.server',"$port",'--bind','127.0.0.1','--directory',$site) `
        -PassThru -WindowStyle Hidden
    Start-Sleep -Seconds 2
    $probe = Invoke-WebRequest "http://127.0.0.1:$port/" -UseBasicParsing -TimeoutSec 10
    if ($probe.StatusCode -ne 200) { throw "服务器未就绪" }

    # 2) headless Chrome（独立 profile，便于只清理自己的进程）
    Write-Host "== 启动 headless Chrome (CDP :$cdpPort) ==" -ForegroundColor Cyan
    Start-Process -FilePath $chrome -ArgumentList @(
        '--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check',
        "--user-data-dir=$profile","--remote-debugging-port=$cdpPort",'--remote-allow-origins=*','about:blank'
    ) | Out-Null
    $chromeStarted = $true
    Start-Sleep -Seconds 3
    Invoke-WebRequest "http://127.0.0.1:$cdpPort/json/version" -UseBasicParsing -TimeoutSec 10 | Out-Null

    Push-Location $here
    try {
        if (-not $StyleOnly) {
            Write-Host "`n===== 控制台/网络健康检查 =====" -ForegroundColor Yellow
            node audit.mjs

            Write-Host "`n===== 横向溢出（390 / 768 / 1280）=====" -ForegroundColor Yellow
            node probe.mjs

            Write-Host "`n===== 交互与诊断全流程 =====" -ForegroundColor Yellow
            node interact.mjs
            node final.mjs

            Write-Host "`n===== 对比度 / 触控 / 页脚 =====" -ForegroundColor Yellow
            node style-audit.mjs
        }

        Write-Host "`n===== 本次提出的 5 项样式修复 =====" -ForegroundColor Yellow
        node styles.mjs
    } finally {
        Pop-Location
    }
}
finally {
    if ($server -and -not $server.HasExited) { Stop-Process -Id $server.Id -Force -ErrorAction SilentlyContinue }
    if ($chromeStarted) {
        Get-CimInstance Win32_Process -Filter "Name='chrome.exe'" |
            Where-Object { $_.CommandLine -match 'cnmath-verify-profile' } |
            ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
    }
    Write-Host "`n== 已清理服务器与 headless Chrome ==" -ForegroundColor Cyan
}
