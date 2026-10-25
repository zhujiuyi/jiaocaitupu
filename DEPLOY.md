# zhishitupu.zhujiuyi.site 部署说明

## 基本信息

| 项 | 值 |
|---|---|
| 域名 | zhishitupu.zhujiuyi.site |
| 服务器 IP | 124.220.192.94 |
| 站点目录 | `/www/wwwroot/zhishitupu.zhujiuyi.site` |
| 项目名（面板） | `zhishitupu` |
| 内部端口 | `3001`（只监听 127.0.0.1，由 nginx 反代） |
| 运行用户 | `www` |
| Node 版本 | v24.19.0（宝塔装的） |
| 面板类型 | Node 项目（`sites` 表 `project_type='Node'`） |

## 在宝塔面板里操作

**Node 项目管理** 里能看到 `zhishitupu`，可以启动 / 停止 / 重启。

底层实现（与服务器上原有的 `redemption_journey` 完全一致）：

| 用途 | 路径 |
|---|---|
| 启动脚本 | `/www/server/nodejs/vhost/scripts/zhishitupu.sh` |
| PID 文件 | `/www/server/nodejs/vhost/pids/zhishitupu.pid` |
| 应用日志 | `/www/wwwlogs/nodejs/zhishitupu.log` |
| nginx 配置 | `/www/server/panel/vhost/nginx/node_zhishitupu.conf` |
| 访问日志 | `/www/wwwlogs/zhishitupu.log` |
| 证书目录 | `/www/server/panel/vhost/cert/zhishitupu/` |

## 应用服务器

`server.mjs`（零依赖，只用 Node 内置模块）：

- 静态文件服务，正确的 MIME 类型
- 目录自动补斜杠（301），保证 `../assets` 这类相对引用正常
- `data/*.json` 和 HTML 不缓存（上游数据更新后立刻生效），静态资源缓存 1 小时
- **安全**：屏蔽 `server.mjs`、`README.md`、`tests/`、`package.json`、`.git`、`.py`/`.sh`/`.md`/`.mjs` 等，越界路径返回 400
- 只接受 GET / HEAD，其它 405
- 支持 `If-Modified-Since`（304）
- 收到 SIGTERM 优雅退出

环境变量（启动脚本里已设）：

| 变量 | 值 |
|---|---|
| `PORT` | 3001 |
| `HOST` | 127.0.0.1 |
| `ROOT` | 站点目录 |
| `CACHE_MAX` | 3600 |

## HTTPS（待办）

当前只开了 HTTP。证书放好后执行：

```bash
bash /tmp/deploy-step5.sh
```

脚本会检测 `证书目录/fullchain.pem` 与 `privkey.pem` 是否存在：
- 存在 → 自动生成 HTTP（301 跳转）+ HTTPS 双 server 块并重载 nginx
- 不存在 → 保持纯 HTTP

**证书放置位置**：

```
/www/server/panel/vhost/cert/zhishitupu/fullchain.pem   # 证书链
/www/server/panel/vhost/cert/zhishitupu/privkey.pem     # 私钥
```

> 注：Let's Encrypt 的 HTTP-01 验证会被腾讯云**境外访问**拦截（域名未备案，返回 DNSPod 封禁页），境内访问不受影响。用腾讯云/DNSPod 申请的免费 DV 证书，或给域名加 CDN 代理后可解决。

## 更新站点内容

在本地重新打包后：

```bash
# 本地
tar -czf /tmp/zhishitupu.tar.gz index.html server.mjs assets explore diagnose children mistakes data .nojekyll LICENSE

# 上传后，在服务器
cd /www/wwwroot/zhishitupu.zhujiuyi.site
find . -mindepth 1 -maxdepth 1 -exec rm -rf {} +
tar -xzf /tmp/zhishitupu.tar.gz -C .
chown -R www:www .
```

然后重启项目（面板里点重启，或 `bash /www/server/nodejs/vhost/scripts/zhishitupu.sh` 前先 kill 旧进程）。

数据文件不缓存，只更新 `data/` 的话**不用重启**。

## 排查

```bash
# 进程
cat /www/server/nodejs/vhost/pids/zhishitupu.pid
ps -p $(cat /www/server/nodejs/vhost/pids/zhishitupu.pid) -o pid,rss,lstart,cmd

# 应用日志
tail -50 /www/wwwlogs/nodejs/zhishitupu.log

# 直接测内部端口
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3001/

# 走 nginx
curl -s -o /dev/null -w '%{http_code}\n' -H 'Host: zhishitupu.zhujiuyi.site' http://127.0.0.1/

# nginx 配置语法
nginx -t
```

## 与原有站点的差异

`tanlangame.zhujiuyi.site`（项目名 `redemption_journey`）是普通的 Node 应用，端口 3000。
本站在其基础上：
- 端口 3001（避开 3000）
- 增加了静态文件专用的安全头与缓存策略
- 屏蔽了源码/文档/测试目录
