/* 孩子档案 + 错题本。纯本机 localStorage，不上传。
   诊断页、档案页、错题本页共用。window.CnmChildren */
(function () {
  'use strict';

  var KEY_CHILDREN = 'cnmChildren.v1';
  // v1（无年级）→ v2（按孩子 + 年级分本）。升级时清空重来，见 migrateLegacy()。
  var KEY_MISTAKES = 'cnmMistakes.v2';
  var KEY_MISTAKES_LEGACY = 'cnmMistakes.v1';
  var MAX_CHILDREN = 8;
  var MAX_NAME = 12;
  var PRIORITY_STEP = 1.6;    // 每答错一次权重乘这个数
  var PRIORITY_CAP = 12;      // 权重封顶
  var BASE_WEIGHT = { weak: 3.0, shaky: 1.5 };
  var KILL_STREAK = 2;        // 连续答对这么多次就移出

  function read(k, fallback) {
    try {
      var v = JSON.parse(localStorage.getItem(k));
      return v && typeof v === 'object' ? v : fallback;
    } catch (e) { return fallback; }
  }
  function write(k, v) {
    try { localStorage.setItem(k, JSON.stringify(v)); return true; }
    catch (e) { return false; }
  }
  function nowIso() { return new Date().toISOString(); }

  /* ------------------------------------------------------------ 孩子档案 */

  function state() {
    var s = read(KEY_CHILDREN, null);
    if (!s || !Array.isArray(s.children)) s = { current: null, children: [] };
    // 当前孩子被删过就落回第一个
    if (s.current && !s.children.some(function (c) { return c.id === s.current; })) {
      s.current = s.children.length ? s.children[0].id : null;
    }
    return s;
  }

  function newId() { return 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

  function list() { return state().children.slice(); }

  function get(id) {
    return state().children.filter(function (c) { return c.id === id; })[0] || null;
  }

  function current() {
    var s = state();
    return s.current ? get(s.current) : null;
  }

  function setCurrent(id) {
    var s = state();
    if (id && !s.children.some(function (c) { return c.id === id; })) return false;
    s.current = id || null;
    write(KEY_CHILDREN, s);
    return true;
  }

  function cleanName(v) {
    return String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, MAX_NAME);
  }

  function check(form, selfId) {
    var s = state();
    var name = cleanName(form && form.name);
    if (!name) return '请填一个昵称。';
    if (s.children.some(function (c) { return c.id !== selfId && c.name === name; })) {
      return '已经有叫「' + name + '」的孩子了，换个昵称区分。';
    }
    return null;
  }

  function add(form) {
    var s = state();
    if (s.children.length >= MAX_CHILDREN) return { ok: false, error: '最多可以建 ' + MAX_CHILDREN + ' 个孩子。' };
    var err = check(form, null);
    if (err) return { ok: false, error: err };
    var child = {
      id: newId(),
      name: cleanName(form.name),
      grade: form.grade == null ? null : form.grade,
      textbook: form.textbook ? String(form.textbook).slice(0, 20) : '',
      createdAt: nowIso()
    };
    s.children.push(child);
    if (!s.current) s.current = child.id;
    write(KEY_CHILDREN, s);
    return { ok: true, child: child };
  }

  function update(id, form) {
    var s = state();
    var i = s.children.map(function (c) { return c.id; }).indexOf(id);
    if (i < 0) return { ok: false, error: '找不到这个孩子。' };
    var err = check(form, id);
    if (err) return { ok: false, error: err };
    s.children[i].name = cleanName(form.name);
    if (form.grade !== undefined) s.children[i].grade = form.grade;
    if (form.textbook !== undefined) s.children[i].textbook = String(form.textbook).slice(0, 20);
    write(KEY_CHILDREN, s);
    return { ok: true, child: s.children[i] };
  }

  function remove(id) {
    var s = state();
    s.children = s.children.filter(function (c) { return c.id !== id; });
    if (s.current === id) s.current = s.children.length ? s.children[0].id : null;
    write(KEY_CHILDREN, s);
    // 连带删掉他的全部错题本（所有年级）
    var m = read(KEY_MISTAKES, {});
    if (m[id]) { delete m[id]; write(KEY_MISTAKES, m); }
    return true;
  }

  /* ------------------------------------------------------------ 错题本 */

  // 错题本按「孩子 → 学科 → 知识点」三层存
  function bookAll() { return read(KEY_MISTAKES, {}); }

  /** 年级归一成字符串；没填就是空串，单独算一本「未分年级」 */
  function gradeKey(g) {
    if (g == null || g === '') return '';
    return String(g);
  }

  /** 某个孩子「当前年级」的错题本（按学科取） */
  function book(childId, subject) {
    var c = get(childId);
    if (!c) return {};
    var g = gradeKey(c.grade);
    var all = bookAll();
    return (all[childId] && all[childId][g] && all[childId][g][subject]) || {};
  }

  function bookSave(childId, subject, obj) {
    var c = get(childId);
    if (!c) return;
    var g = gradeKey(c.grade);
    var all = bookAll();
    if (!all[childId]) all[childId] = {};
    if (!all[childId][g]) all[childId][g] = {};
    if (!obj || !Object.keys(obj).length) delete all[childId][g][subject];
    else all[childId][g][subject] = obj;
    if (!Object.keys(all[childId][g]).length) delete all[childId][g];
    if (!Object.keys(all[childId]).length) delete all[childId];
    write(KEY_MISTAKES, all);
  }

  /** 列出这个孩子所有有错题的年级（降序），用于档案页显示 */
  function gradesOf(childId) {
    var all = bookAll()[childId] || {};
    return Object.keys(all).filter(function (g) {
      return all[g] && Object.keys(all[g]).length;
    }).sort(function (a, b) {
      if (a === '') return 1;
      if (b === '') return -1;
      return Number(b) - Number(a);
    });
  }

  /** 指定年级的错题数（不分学科） */
  function countInGrade(childId, grade) {
    var all = bookAll()[childId] || {};
    var g = all[gradeKey(grade)] || {};
    return Object.keys(g).reduce(function (acc, s) {
      return acc + Object.keys(g[s] || {}).length;
    }, 0);
  }

  /* 旧版（v1，无年级）数据：按用户要求升级时清空重来 */
  function migrateLegacy() {
    var legacy = read(KEY_MISTAKES_LEGACY, null);
    if (legacy) {
      try { localStorage.removeItem(KEY_MISTAKES_LEGACY); } catch (e) { /* ignore */ }
    }
  }

  /**
   * 记录一次答题结果。只有 weak / shaky 会进错题本。
   * @param {string} childId
   * @param {string} subject  math|english|physics|chinese
   * @param {string} topicId
   * @param {string} status   weak|shaky|mastered
   * @returns {{entered:boolean, removed:boolean, streak:number}}
   */
  function recordResult(childId, subject, topicId, status) {
    if (!childId || !topicId) return { entered: false, removed: false, streak: 0 };
    var b = book(childId, subject);
    var row = b[topicId] || null;

    if (status === 'mastered') {
      // 一次就对：不进错题本；已在里面的算答对一次
      if (!row) return { entered: false, removed: false, streak: 0 };
      row.correctStreak = (row.correctStreak || 0) + 1;
      row.lastTestedAt = nowIso();
      row.testCount = (row.testCount || 0) + 1;
      if (row.correctStreak >= KILL_STREAK) {
        delete b[topicId];
        bookSave(childId, subject, b);
        return { entered: false, removed: true, streak: row.correctStreak };
      }
      bookSave(childId, subject, b);
      return { entered: false, removed: false, streak: row.correctStreak, markedCorrect: true };
    }

    if (status !== 'weak' && status !== 'shaky') return { entered: false, removed: false, streak: 0 };

    if (!row) {
      row = {
        id: topicId,
        status: status,
        correctStreak: 0,
        testCount: 1,
        wrongCount: 1,
        priority: BASE_WEIGHT[status] || 3.0,
        firstWrongAt: nowIso(),
        wrongAt: nowIso(),
        lastTestedAt: nowIso()
      };
      b[topicId] = row;
      bookSave(childId, subject, b);
      return { entered: true, removed: false, streak: 0 };
    }

    // 已在错题本里又答错：加重、清零连续对
    row.status = status;
    row.correctStreak = 0;
    row.wrongCount = (row.wrongCount || 1) + 1;
    row.testCount = (row.testCount || 0) + 1;
    row.wrongAt = nowIso();
    row.lastTestedAt = nowIso();
    row.priority = Math.min(PRIORITY_CAP, (row.priority || BASE_WEIGHT[status] || 3.0) * PRIORITY_STEP);
    b[topicId] = row;
    bookSave(childId, subject, b);
    return { entered: false, removed: false, streak: 0, aggravated: true };
  }

  /** 手动移出 */
  function removeOne(childId, subject, topicId) {
    var b = book(childId, subject);
    if (!b[topicId]) return false;
    delete b[topicId];
    bookSave(childId, subject, b);
    return true;
  }

  /** 按权重降序列出 */
  function listMistakes(childId, subject) {
    var b = book(childId, subject);
    return Object.keys(b).map(function (k) { return b[k]; })
      .sort(function (a, c) {
        // 待确认（连续对 1 次）排最前，然后按权重
        var pa = a.correctStreak === 1 ? 1e9 : (a.priority || 0);
        var pc = c.correctStreak === 1 ? 1e9 : (c.priority || 0);
        if (pc !== pa) return pc - pa;
        return String(c.wrongAt || '').localeCompare(String(a.wrongAt || ''));
      });
  }

  /** 统计 */
  function stats(childId, subject) {
    var rows = listMistakes(childId, subject);
    var out = { total: rows.length, weak: 0, shaky: 0, pending: 0 };
    rows.forEach(function (r) {
      if (r.status === 'weak') out.weak++;
      else if (r.status === 'shaky') out.shaky++;
      if (r.correctStreak === 1) out.pending++;
    });
    return out;
  }

  /** 当前年级下各学科错题数 */
  function countBySubject(childId) {
    var c = get(childId);
    if (!c) return {};
    var g = (bookAll()[childId] || {})[gradeKey(c.grade)] || {};
    var out = {};
    Object.keys(g).forEach(function (s) { out[s] = Object.keys(g[s] || {}).length; });
    return out;
  }

  /**
   * 抽 N 个知识点。
   * 规则：先把「连续对过 1 次、待确认」的全选上（超了就随机取）；
   * 剩余名额按权重无放回加权抽样；总数不足 N 就全用上。
   */
  function pick(childId, subject, n) {
    var rows = listMistakes(childId, subject);
    if (!rows.length || n <= 0) return [];
    var limit = Math.min(n, rows.length);

    var pending = rows.filter(function (r) { return r.correctStreak === 1; });
    var rest = rows.filter(function (r) { return r.correctStreak !== 1; });

    var chosen = [];
    // 1) 待确认的优先，超员随机
    if (pending.length > limit) {
      chosen = shuffle(pending).slice(0, limit);
      return chosen.map(function (r) { return r.id; });
    }
    chosen = pending.slice();

    // 2) 按权重无放回抽样
    var pool = rest.slice();
    while (chosen.length < limit && pool.length) {
      var total = 0, i;
      for (i = 0; i < pool.length; i++) total += Math.max(0.01, pool[i].priority || 1);
      var rnd = Math.random() * total, acc = 0, hit = pool.length - 1;
      for (i = 0; i < pool.length; i++) {
        acc += Math.max(0.01, pool[i].priority || 1);
        if (rnd <= acc) { hit = i; break; }
      }
      chosen.push(pool[hit]);
      pool.splice(hit, 1);
    }
    // 打乱最终顺序，避免永远按权重顺序出题
    return shuffle(chosen).map(function (r) { return r.id; });
  }

  function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  /* ------------------------------------------------------------ 导出 / 导入 */

  var BACKUP_KIND = 'cnmBackup';
  // v2 起 mistakes 多了一层「年级」。导入 v1 时错题会被丢弃（旧数据本来就不分年级）。
  var BACKUP_VERSION = 2;
  var BACKUP_MAX_IMPORT_VERSION = 2;

  /** 打包成可直接 JSON.stringify 的对象 */
  function exportData() {
    var s = state();
    var all = bookAll();
    var books = {};
    s.children.forEach(function (c) {
      // 只带这个孩子实际有错题的年级，结构 { childId: { gradeKey: { subject: {...} } } }
      var byGrade = all[c.id];
      if (!byGrade || !Object.keys(byGrade).length) return;
      var kept = {};
      Object.keys(byGrade).forEach(function (g) {
        if (byGrade[g] && Object.keys(byGrade[g]).length) kept[g] = byGrade[g];
      });
      if (Object.keys(kept).length) books[c.id] = kept;
    });
    return {
      kind: BACKUP_KIND,
      version: 2,
      exportedAt: nowIso(),
      children: s.children.map(function (c) {
        return { id: c.id, name: c.name, grade: c.grade, textbook: c.textbook, createdAt: c.createdAt };
      }),
      current: s.current,
      mistakes: books
    };
  }

  /** 校验一个解析后的备份对象，返回错误文案或 null */
  function validateBackup(data) {
    if (!data || typeof data !== 'object') return '不是有效的 JSON 对象。';
    if (data.kind !== BACKUP_KIND) return '这不是本工具导出的备份文件。';
    if (!Array.isArray(data.children)) return '备份里缺少 children 列表。';
    if (!(data.version >= 1)) return '备份缺少版本号。';
    if (data.version > BACKUP_MAX_IMPORT_VERSION) return '备份来自更新的版本（v' + data.version + '），请升级后再导入。';
    var seen = {};
    for (var i = 0; i < data.children.length; i++) {
      var c = data.children[i];
      if (!c || typeof c.id !== 'string' || !c.id) return '第 ' + (i + 1) + ' 个孩子的 id 无效。';
      if (typeof c.name !== 'string' || !c.name.trim()) return '第 ' + (i + 1) + ' 个孩子没有昵称。';
      if (seen[c.id]) return '备份里有重复的孩子 id：' + c.id;
      seen[c.id] = 1;
    }
    if (data.children.length > MAX_CHILDREN) return '备份里有 ' + data.children.length + ' 个孩子，超过上限 ' + MAX_CHILDREN + '。';
    if (data.mistakes != null && typeof data.mistakes !== 'object') return '备份里的 mistakes 格式不对。';
    return null;
  }

  /**
   * 导入。
   * @param {object} data  已 JSON.parse 的备份对象
   * @param {'merge'|'replace'} mode
   * @returns {{ok:boolean, error?:string, added?:number, replaced?:boolean, skipped?:number}}
   */
  function importData(data, mode) {
    var err = validateBackup(data);
    if (err) return { ok: false, error: err };

    var incoming = data.children.map(function (c) {
      return {
        id: c.id,
        name: cleanName(c.name),
        grade: c.grade == null ? null : c.grade,
        textbook: c.textbook ? String(c.textbook).slice(0, 20) : '',
        createdAt: c.createdAt || nowIso()
      };
    });

    var isV2 = data.version >= 2;
    var dropped = 0;   // v1 备份里没有年级信息，导入时丢弃这些错题

    if (mode === 'replace') {
      // 覆盖：本地全清，以文件为准
      write(KEY_CHILDREN, { current: data.current || (incoming[0] ? incoming[0].id : null), children: incoming });
      var m = {};
      if (isV2) {
        Object.keys(data.mistakes || {}).forEach(function (cid) {
          var byGrade = data.mistakes[cid];
          if (!byGrade || typeof byGrade !== 'object') return;
          var kept = {};
          Object.keys(byGrade).forEach(function (g) {
            if (byGrade[g] && typeof byGrade[g] === 'object' && Object.keys(byGrade[g]).length) kept[g] = byGrade[g];
          });
          if (Object.keys(kept).length) m[cid] = kept;
        });
      } else {
        Object.keys(data.mistakes || {}).forEach(function (cid) {
          var legacy = data.mistakes[cid];
          if (!legacy || typeof legacy !== 'object') return;
          Object.keys(legacy).forEach(function (sub) {
            dropped += Object.keys(legacy[sub] || {}).length;
          });
        });
      }
      write(KEY_MISTAKES, m);
      return { ok: true, added: incoming.length, replaced: true, skipped: 0, mistakesDropped: dropped };
    }

    // 合并：保留本地，按 id 对齐；本地没有的追加，同名不同 id 的自动改名
    var s = state();
    var haveIds = {};
    var haveNames = {};
    s.children.forEach(function (c) { haveIds[c.id] = 1; haveNames[c.name] = 1; });

    var added = 0, skipped = 0;
    incoming.forEach(function (c) {
      if (haveIds[c.id]) { skipped++; return; }          // 同一个档案（同一台设备导出又导回）
      if (s.children.length >= MAX_CHILDREN) { skipped++; return; }
      var name = c.name;
      if (haveNames[name]) {
        // 不同 id 但重名：加后缀区分，避免 add() 的重名校验挡住
        var n = 2;
        while (haveNames[name + '（' + n + '）']) n++;
        name = name + '（' + n + '）';
      }
      var child = {
        id: c.id, name: name, grade: c.grade, textbook: c.textbook, createdAt: c.createdAt
      };
      s.children.push(child);
      haveIds[child.id] = 1;
      haveNames[name] = 1;
      added++;
    });
    if (!s.current) s.current = s.children.length ? s.children[0].id : null;
    write(KEY_CHILDREN, s);

    // 错题本合并：孩子 → 年级 → 学科 → 知识点；同一条取「更顽固」的那条
    var all = bookAll();
    var mAdded = 0;
    if (isV2) {
      Object.keys(data.mistakes || {}).forEach(function (cid) {
        if (!haveIds[cid]) return;                        // 孩子没被合并进来就跳过
        var byGrade = data.mistakes[cid];
        if (!byGrade || typeof byGrade !== 'object') return;
        if (!all[cid]) all[cid] = {};
        Object.keys(byGrade).forEach(function (g) {
          var bySubject = byGrade[g];
          if (!bySubject || typeof bySubject !== 'object') return;
          if (!all[cid][g]) all[cid][g] = {};
          Object.keys(bySubject).forEach(function (subject) {
            var rows = bySubject[subject];
            if (!rows || typeof rows !== 'object') return;
            if (!all[cid][g][subject]) all[cid][g][subject] = {};
            Object.keys(rows).forEach(function (tid) {
              var inc = rows[tid];
              if (!inc || typeof inc !== 'object') return;
              var cur = all[cid][g][subject][tid];
              if (!cur) { all[cid][g][subject][tid] = inc; mAdded++; return; }
              var incP = inc.priority || 0, curP = cur.priority || 0;
              var incS = inc.correctStreak || 0, curS = cur.correctStreak || 0;
              if (incP > curP || (incP === curP && incS < curS)) all[cid][g][subject][tid] = inc;
            });
          });
        });
      });
    } else {
      // v1 备份没有年级，错题全部丢弃（只迁移档案）
      Object.keys(data.mistakes || {}).forEach(function (cid) {
        var legacy = data.mistakes[cid];
        if (!legacy || typeof legacy !== 'object') return;
        Object.keys(legacy).forEach(function (sub) {
          dropped += Object.keys(legacy[sub] || {}).length;
        });
      });
    }
    write(KEY_MISTAKES, all);
    return { ok: true, added: added, replaced: false, skipped: skipped, mistakesAdded: mAdded, mistakesDropped: dropped };
  }

  window.CnmChildren = {
    MAX_CHILDREN: MAX_CHILDREN,
    KILL_STREAK: KILL_STREAK,
    list: list,
    get: get,
    current: current,
    setCurrent: setCurrent,
    add: add,
    update: update,
    remove: remove,

    recordResult: recordResult,
    removeOne: removeOne,
    listMistakes: listMistakes,
    stats: stats,
    countBySubject: countBySubject,
    pick: pick,

    exportData: exportData,
    validateBackup: validateBackup,
    importData: importData,

    gradeKey: gradeKey,
    gradesOf: gradesOf,
    countInGrade: countInGrade,
    migrateLegacy: migrateLegacy
  };

  // 旧版错题本（v1，不分年级）按约定升级时清空重来
  migrateLegacy();
})();
