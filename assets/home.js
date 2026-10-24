/* 首页：统计和年级入口都从 data/*.json 计算，不写死数量。 */
(function () {
  'use strict';
  var raw = location.hash.replace(/^#/, '');
  try { raw = decodeURIComponent(raw); } catch (e) { /* 保持原样 */ }
  if (/^cn[a-z]?_[A-Za-z0-9]+$/.test(raw)) return;

  var CN = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
  var SUBJECTS = { english: 1, physics: 1, chinese: 1 };
  var paramSubject = new URLSearchParams(location.search).get('subject');
  var subject = SUBJECTS[paramSubject] ? paramSubject : 'math';

  function withSubject(href) {
    if (subject === 'math' || !href || href.indexOf('subject=') >= 0 || href.indexOf('http') === 0) return href;
    return href + (href.indexOf('?') >= 0 ? '&' : '?') + 'subject=' + subject;
  }

  ['english', 'physics', 'chinese'].forEach(function (s) {
    document.body.classList.toggle('subject-' + s, subject === s);
  });
  // 学科是「知识图谱 / 诊断」各自的二级菜单：两个菜单都只高亮当前学科那一个
  document.querySelectorAll('.nav-menu[data-group]').forEach(function (menu) {
    menu.querySelectorAll('.subject-link').forEach(function (link) {
      var on = link.getAttribute('data-subject') === subject;
      link.classList.toggle('on', on);
      if (on) link.setAttribute('aria-current', 'true');
      else link.removeAttribute('aria-current');
    });
  });
  document.querySelectorAll('.site-nav a:not(.subject-link), a.brand').forEach(function (link) {
    var href = link.getAttribute('href');
    var next = withSubject(href);
    if (next && next !== href) link.setAttribute('href', next);
  });
  if (subject !== 'math') {
    var isPhy = subject === 'physics';
    var isZh = subject === 'chinese';
    var NAMES = { english: '英语', physics: '物理', chinese: '小学语文' };
    var EYES = {
      english: '英语：三年级到高中 · 人教 PEP（小学三年级起点）',
      physics: '物理：八年级到高中 · 人教版（2022 年版课标）',
      chinese: '语文：小学一至六年级 · 统编版'
    };
    var LEDES = {
      english: '沿着先修关系自适应出题。英语覆盖三年级到高中，从你选的知识点往回追，定位薄弱根因，并给出一条按学习顺序排起的路径。',
      physics: '沿着先修关系自适应出题。物理从八年级到高中必修和选择性必修，从你选的知识点往回追，定位薄弱根因，并给出一条按学习顺序排起的路径。',
      chinese: '沿着先修关系自适应出题。小学语文一至六年级按统编教材逐册整理，从你选的知识点往回追，定位薄弱根因，并给出一条按学习顺序排起的路径。'
    };
    var STEPS = {
      english: '英语从三年级到高中必修和选择性必修。搜索或按册、章找到想检查的内容。',
      physics: '物理从八年级上下册到高中必修和选择性必修。搜索或按册、章找到想检查的内容。',
      chinese: '小学语文从一年级到六年级，按统编教材单元排列。搜索或按册、章找到想检查的内容。'
    };
    document.title = NAMES[subject] + ' · 中小学知识图谱';
    var eye = document.querySelector('.eyebrow');
    if (eye) eye.textContent = EYES[subject];
    var lede = document.querySelector('.lede');
    if (lede) lede.textContent = LEDES[subject];
    var stepP = document.querySelectorAll('.steps li p');
    if (stepP.length) stepP[0].textContent = STEPS[subject];
    var primary = document.querySelector('.hero-actions a.btn-primary');
    var browse = document.querySelector('.hero-actions a.btn:not(.btn-primary)');
    if (primary) primary.setAttribute('href', 'diagnose/?subject=' + subject);
    if (browse) browse.setAttribute('href', 'explore/?subject=' + subject);
    var demo = document.querySelector('.quiet-link a');
    if (demo) {
      demo.setAttribute('href', 'diagnose/?subject=' + subject + '&grade=' +
        encodeURIComponent(isZh ? '一上' : isPhy ? '八上' : '四上') + '&demo=1');
      demo.textContent = isZh ? '先看一遍演示：一年级上册语文'
        : isPhy ? '先看一遍演示：八年级上册物理' : '先看一遍演示：四年级上册英语';
    }
  }

  function setText(id, value) {
    var node = document.getElementById(id);
    if (node) node.textContent = value;
  }

  function fail(message) {
    var box = document.getElementById('load-error');
    if (!box) return;
    box.hidden = false;
    box.textContent = message;
  }

  Promise.all([
    fetch('data/topics.json'),
    fetch('data/dependencies.json'),
    fetch('data/questions.json'),
    fetch('data/cn-curriculum-standards.json')
  ]).then(function (responses) {
    responses.forEach(function (response, index) {
      if (!response.ok) throw new Error('HTTP ' + response.status);
    });
    return Promise.all(responses.map(function (response) { return response.json(); }));
  }).then(function (data) {
    var topics = data[0];
    var deps = data[1];
    var questions = data[2];
    var standards = data[3];
    if (!Array.isArray(topics) || !Array.isArray(deps) || !Array.isArray(questions)) {
      throw new Error('数据格式无法识别');
    }
    var items = standards && Array.isArray(standards.items) ? standards.items : [];
    // 学科由 id 前缀判定：cnp_ 物理、cne_ 英语，其余是数学
    var SUBJECT_PREFIX = { cnm: 'math', cne: 'english', cnp: 'physics', cnc: 'chinese' };
    var STANDARD_PREFIX = { 'cms-': 'math', 'ces-': 'english', 'cps-': 'physics', 'ccs-': 'chinese' };
    function subjectOfId(id) {
      return SUBJECT_PREFIX[String(id || '').slice(0, 3)] || 'math';
    }
    function subjectOfTopic(topic) {
      var explicit = topic && topic.subject;
      if (explicit && /^(english|physics|chinese|math)$/.test(explicit)) return explicit;
      return subjectOfId(topic && topic.id);
    }
    function standardSubject(id) {
      return STANDARD_PREFIX[String(id || '').slice(0, 4)] || 'math';
    }
    var want = subject;
    topics = topics.filter(function (topic) { return subjectOfTopic(topic) === want; });
    deps = deps.filter(function (edge) { return subjectOfId(edge.topicId) === want; });
    questions = questions.filter(function (question) { return subjectOfId(question.topicId) === want; });
    items = items.filter(function (item) { return standardSubject(item.id) === want; });
    setText('n-topics', String(topics.length));
    setText('n-edges', String(deps.length));
    setText('n-questions', String(questions.length));
    setText('n-standards', String(items.length));

    var grades = document.getElementById('grades');
    if (!grades) return;
    grades.replaceChildren();
    grades.removeAttribute('aria-busy');
    function addCard(g, stageName, title, klass, splitText, href) {
      var list = topics.filter(function (topic) { return topic.grade === g; });
      var link = document.createElement('a');
      link.className = 'grade-card ' + klass;
      link.href = href;
      var stage = document.createElement('span');
      stage.className = 'grade-stage';
      stage.textContent = stageName;
      var name = document.createElement('strong');
      name.textContent = title;
      var count = document.createElement('span');
      count.className = 'grade-count';
      count.textContent = list.length + ' 个知识点';
      var split = document.createElement('span');
      split.className = 'grade-stage';
      split.textContent = splitText;
      link.append(stage, name, count, split);
      grades.append(link);
    }
    function subjectQuery() {
      return want === 'math' ? '' : 'subject=' + want + '&';
    }
    if (want === 'physics') {
      // 物理：八年级（八上 + 八下）、九年级（全一册）
      [[8, '八年级', '上 ' + topics.filter(function (t) { return t.grade === 8 && t.semester === '上'; }).length +
        ' · 下 ' + topics.filter(function (t) { return t.grade === 8 && t.semester === '下'; }).length],
       [9, '九年级', '全一册']].forEach(function (row) {
        addCard(row[0], '初中', row[1], 'is-junior', row[2], 'explore/?subject=physics&grade=' + row[0]);
      });
    } else if (want === 'chinese') {
      // 语文只有小学一至六年级，按上 / 下册
      for (var zg = 1; zg <= 6; zg++) {
        var zlist = topics.filter(function (topic) { return topic.grade === zg; });
        var zup = zlist.filter(function (topic) { return topic.semester === '上'; }).length;
        var zdown = zlist.filter(function (topic) { return topic.semester === '下'; }).length;
        addCard(zg, '小学', CN[zg] + '年级', 'is-primary', '上 ' + zup + ' · 下 ' + zdown,
          'explore/?subject=chinese&grade=' + zg);
      }
    } else {
      var from = want === 'english' ? 3 : 1;
      for (var g = from; g <= 9; g++) {
        var list = topics.filter(function (topic) { return topic.grade === g; });
        var up = list.filter(function (topic) { return topic.semester === '上'; }).length;
        var down = list.filter(function (topic) { return topic.semester === '下'; }).length;
        var full = list.filter(function (topic) { return topic.semester === '全'; }).length;
        var split = full ? '全一册' : '上 ' + up + ' · 下 ' + down;
        addCard(g, g <= 6 ? '小学' : '初中', CN[g] + '年级', g <= 6 ? 'is-primary' : 'is-junior', split,
          'explore/?' + subjectQuery() + 'grade=' + g);
      }
    }
    if (want === 'english') {
      // 英语高中按册次：必修一~三、选必一~四
      [['必修一', 10, '必修第一册'], ['必修二', 11, '必修第二册'], ['必修三', 12, '必修第三册'],
       ['选必一', 13, '选择性必修第一册'], ['选必二', 14, '选择性必修第二册'],
       ['选必三', 15, '选择性必修第三册'], ['选必四', 16, '选择性必修第四册']].forEach(function (row) {
        addCard(row[1], '高中', row[0], 'is-senior', row[2], 'explore/?subject=english&grade=' + row[1]);
      });
    } else if (want === 'physics') {
      // 高中物理：必修一~三、选必一~三
      [['必修一', 10, '必修第一册'], ['必修二', 11, '必修第二册'], ['必修三', 12, '必修第三册'],
       ['选必一', 13, '选择性必修第一册'], ['选必二', 14, '选择性必修第二册'],
       ['选必三', 15, '选择性必修第三册']].forEach(function (row) {
        addCard(row[1], '高中', row[0], 'is-senior', row[2], 'explore/?subject=physics&grade=' + row[1]);
      });
    } else if (want === 'math') {
      addCard(10, '高中', '高一', 'is-senior', '必修第一册', 'explore/?grade=10');
      addCard(11, '高中', '高二', 'is-senior', '必修第二册', 'explore/?grade=11');
      addCard(12, '高中', '选必一', 'is-senior', '选择性必修第一册', 'explore/?grade=12');
      addCard(13, '高中', '选必二', 'is-senior', '选择性必修第二册', 'explore/?grade=13');
      addCard(14, '高中', '选必三', 'is-senior', '选择性必修第三册', 'explore/?grade=14');
    }
  }).catch(function (error) {
    fail('数据没有加载成功（' + (error && error.message ? error.message : error) + '）。请在项目根目录运行 python3 -m http.server 8000，再用浏览器打开，不要直接双击 html 文件。');
  });
})();
