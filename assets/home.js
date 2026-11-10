/* 首页：统计和年级入口都从 data/*.json 计算，不写死数量。 */
(function () {
  'use strict';
  var S = window.CnmSubjects;
  var paramSubject = new URLSearchParams(location.search).get('subject');
  var subject = S.known(paramSubject) ? paramSubject : 'math';
  var info = S.catalog[subject];

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

  if (subject !== 'math') {
    document.title = info.name + ' · 中小学知识图谱';
    document.querySelector('.eyebrow').textContent = info.name + ' · ' + info.range + ' · ' + info.edition;
    document.querySelector('.lede').textContent = '沿着先修关系自适应出题，从选中的' + info.name +
      '知识点往回追，定位薄弱根因，并给出补学顺序。';
    document.querySelector('.steps li p').textContent = '搜索或按年级、册次找到想检查的' + info.name + '知识点。';
    document.querySelectorAll('.hero-actions a').forEach(function (link) {
      link.setAttribute('href', S.withSubject(link.getAttribute('href'), subject));
    });
    var demo = document.querySelector('.quiet-link a');
    if (demo) {
      var scope = info.demoVolume ? 'grade=' + encodeURIComponent(info.demoVolume) : 'target=' + info.sample;
      demo.setAttribute('href', S.withSubject('diagnose/?' + scope + '&demo=1', subject));
      demo.textContent = '先看一遍演示：' + (info.demoVolume ? S.volumeLabel(info.demoVolume) : '') + info.name;
    }
  }

  Promise.all([
    fetch('data/topics.json'),
    fetch('data/dependencies.json'),
    fetch('data/questions.json'),
    fetch('data/cn-curriculum-standards.json')
  ]).then(function (responses) {
    responses.forEach(function (response) {
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
    topics = topics.filter(function (topic) { return !topic.archived && S.fromTopic(topic) === subject; });
    var ids = new Set(topics.map(function (topic) { return topic.id; }));
    var items = standards && Array.isArray(standards.items) ? standards.items : [];
    setText('n-topics', String(topics.length));
    setText('n-edges', String(deps.filter(function (edge) { return ids.has(edge.topicId); }).length));
    setText('n-questions', String(questions.filter(function (q) { return ids.has(q.topicId); }).length));
    setText('n-standards', String(items.filter(function (item) { return S.fromStandard(item.id) === subject; }).length));

    var grid = document.getElementById('grades');
    if (!grid) return;
    grid.replaceChildren();
    grid.removeAttribute('aria-busy');
    var stageClass = { p: 'is-primary', j: 'is-junior', h: 'is-senior' };

    function textNode(tag, klass, value) {
      var node = document.createElement(tag);
      if (klass) node.className = klass;
      node.textContent = value;
      return node;
    }

    S.grades(topics).forEach(function (grade) {
      var list = topics.filter(function (topic) { return topic.grade === grade; });
      var stage = S.stage(grade);
      var book = S.book(subject, grade);
      var split = book ? book[1] : ['上', '下', '全'].map(function (semester) {
        var count = list.filter(function (topic) { return topic.semester === semester; }).length;
        if (!count) return '';
        return semester === '全' && count === list.length ? '全一册' : semester + ' ' + count;
      }).filter(Boolean).join(' · ');
      var link = document.createElement('a');
      link.className = 'grade-card ' + stageClass[stage];
      link.href = S.withSubject('explore/?grade=' + grade, subject);
      link.append(
        textNode('span', 'grade-stage', S.stages[stage]),
        textNode('strong', '', S.gradeLabel(subject, grade)),
        textNode('span', 'grade-count', list.length + ' 个知识点'),
        textNode('span', 'grade-stage', split)
      );
      grid.append(link);
    });
  }).catch(function (error) {
    fail('数据没有加载成功（' + (error && error.message ? error.message : error) + '）。请在项目根目录运行 node server.mjs，再用浏览器打开。');
  });
})();
