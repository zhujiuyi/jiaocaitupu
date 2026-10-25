// 中小学知识图谱 · 静态站点服务器
// 纯静态站点宿主：只做文件服务 + 正确的 MIME + SPA 无关的直出。
// 零依赖，只用 Node 内置模块。宝塔 Node 项目管理里可启停。
//
// 环境变量：
//   PORT        监听端口（默认 3001）
//   HOST        绑定地址（默认 127.0.0.1，由 nginx 反代；设 0.0.0.0 可直连）
//   ROOT        站点根目录（默认脚本所在目录）
//   CACHE_MAX   静态资源 Cache-Control 秒数（默认 3600；数据文件不缓存）

import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3001);
const HOST = process.env.HOST || '127.0.0.1';
const ROOT = process.env.ROOT || HERE;
const CACHE_MAX = Number(process.env.CACHE_MAX || 3600);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8'
};

// 不缓存：数据文件会在上游更新后替换，缓存住会让页面看到旧数据
const NO_CACHE_DIRS = ['/data/'];

// 站点对外只提供页面与静态资源；这些文件/目录不对外暴露
const DENY_FILES = new Set([
  'server.mjs', 'package.json', 'package-lock.json', 'node_modules',
  '.gitignore', '.nojekyll', 'readme.md', 'license', 'tests',
  'deploy-ssh.py', 'probe-bt.py'
]);
const DENY_DIRS = new Set(['tests', 'node_modules', '.git', '.github', '.git']);
const DENY_EXT = ['.md', '.mjs', '.log', '.env', '.ini', '.conf', '.bak', '.old', '.tmp', '.map'];

function send(res, code, body, headers = {}) {
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(String(body), 'utf8');
  res.writeHead(code, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Content-Length': buf.length,
    // 安全头：站点不加载外部脚本，但保留最小集合
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    ...headers
  });
  res.end(buf);
}

/** 把 URL 路径安全地解析成文件系统路径；越界或命中黑名单返回 null */
function resolvePath(urlPath) {
  let p;
  try {
    p = decodeURIComponent(urlPath.split('?')[0].split('#')[0]);
  } catch {
    return null; // 非法百分号编码
  }
  if (p.includes('\0')) return null;

  // normalize('/' + p) 会把开头的 .. 钳到根，本身不会逃出 ROOT；
  // 这里再显式检查一次并做前缀校验，双保险。
  const norm = normalize('/' + p);
  if (norm.split(/[/\\]/).includes('..')) return null;

  const full = normalize(join(ROOT, norm));
  const rootWithSep = ROOT.endsWith(sep) ? ROOT : ROOT + sep;
  if (full !== ROOT && !full.startsWith(rootWithSep)) return null;

  // 站点是纯静态页面，服务器源码、包配置、测试脚本都不该对外提供
  const rel = full.slice(ROOT.length).replace(/^[/\\]+/, '').toLowerCase();
  const firstSeg = rel.split(/[/\\]/)[0];
  if (DENY_FILES.has(firstSeg) || DENY_FILES.has(rel)) return null;
  if (DENY_EXT.some((e) => rel.endsWith(e))) return null;
  if (rel.split(/[/\\]/).some((seg) => DENY_DIRS.has(seg))) return null;

  return full;
}

function shouldNoCache(urlPath) {
  return NO_CACHE_DIRS.some((d) => urlPath.startsWith(d));
}

const server = createServer(async (req, res) => {
  // 只处理 GET / HEAD
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return send(res, 405, 'Method Not Allowed', { Allow: 'GET, HEAD' });
  }

  const urlPath = req.url || '/';
  let full = resolvePath(urlPath);
  if (!full) return send(res, 400, 'Bad Request');

  try {
    let info = await stat(full);

    // 目录：尝试 index.html，否则 403（不做目录列表）
    if (info.isDirectory()) {
      if (!urlPath.endsWith('/')) {
        // 补斜杠，保持相对路径正确（页面用 ../assets 之类的相对引用）
        const q = urlPath.includes('?') ? urlPath.slice(urlPath.indexOf('?')) : '';
        res.writeHead(301, { Location: urlPath.replace(q, '') + '/' + q });
        return res.end();
      }
      full = join(full, 'index.html');
      info = await stat(full).catch(() => null);
      if (!info) return send(res, 403, 'Forbidden');
    }

    if (!info || !info.isFile()) return send(res, 404, 'Not Found');

    const ext = extname(full).toLowerCase();
    const type = MIME[ext] || 'application/octet-stream';
    const noCache = shouldNoCache(urlPath) || ext === '.html';

    const headers = {
      'Content-Type': type,
      'Content-Length': info.size,
      'Last-Modified': info.mtime.toUTCString(),
      'Cache-Control': noCache ? 'no-cache' : `public, max-age=${CACHE_MAX}`,
      'X-Content-Type-Options': 'nosniff'
    };

    // 条件请求：数据文件频繁更新，让浏览器用 304 省流量
    const ims = req.headers['if-modified-since'];
    if (ims) {
      const since = Date.parse(ims);
      if (!Number.isNaN(since) && Math.floor(info.mtimeMs / 1000) <= Math.floor(since / 1000)) {
        res.writeHead(304, { 'Cache-Control': headers['Cache-Control'] });
        return res.end();
      }
    }

    res.writeHead(200, headers);
    if (req.method === 'HEAD') return res.end();
    createReadStream(full).pipe(res);
  } catch (err) {
    if (err && (err.code === 'ENOENT' || err.code === 'ENOTDIR')) {
      return send(res, 404, 'Not Found');
    }
    console.error('[静态服务器] 读文件失败:', req.url, err && err.message);
    return send(res, 500, 'Internal Server Error');
  }
});

server.on('clientError', (err, socket) => {
  if (socket.writable) socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
});

server.listen(PORT, HOST, () => {
  console.log(`中小学知识图谱已启动  http://${HOST}:${PORT}/`);
  console.log(`站点根目录: ${ROOT}`);
  console.log(`数据文件不缓存，静态资源缓存 ${CACHE_MAX}s`);
});

// 优雅退出：宝塔停项目时会发 SIGTERM
for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, () => {
    console.log(`收到 ${sig}，正在关闭…`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
  });
}
