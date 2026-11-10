/* 学科编号、学段和册次由首页、图谱、诊断和错题本共用。 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.CnmSubjects = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const catalog = {
    math: { name: '数学', prefix: 'cnm', standard: 'cms', sample: 'cnm_221' },
    english: { name: '英语', prefix: 'cne', standard: 'ces', sample: 'cne_p148', range: '三年级到高中', edition: '人教版', demoVolume: '四上' },
    physics: { name: '物理', prefix: 'cnp', standard: 'cps', sample: 'cnp_071', range: '八年级到高中', edition: '人教版', demoVolume: '八上' },
    chinese: { name: '语文', prefix: 'cnc', standard: 'ccs', sample: 'cnc_p001', range: '一年级到九年级', edition: '统编版', demoVolume: '一上' },
    science: { name: '科学', prefix: 'cns', standard: 'css', sample: 'cns_p001', range: '一年级到六年级', edition: '教科版' },
    morality: { name: '道德与法治', prefix: 'cnd', standard: 'cds', sample: 'cnd_p001', range: '一年级到八年级', edition: '统编版' },
    history: { name: '历史', prefix: 'cnh', standard: 'chs', sample: 'cnh_j001', range: '七年级到九年级', edition: '统编版' },
    geography: { name: '地理', prefix: 'cng', standard: 'cgs', sample: 'cng_j001', range: '七年级到八年级', edition: '人教版' },
    biology: { name: '生物', prefix: 'cnb', standard: 'cbs', sample: 'cnb_j001', range: '七年级到八年级', edition: '人教版' },
    chemistry: { name: '化学', prefix: 'cnk', standard: 'cks', sample: 'cnk_j002', range: '九年级上下册', edition: '人教版' }
  };
  const keys = Object.keys(catalog);
  const byPrefix = new Map(keys.map(key => [catalog[key].prefix, key]));
  const byStandard = new Map(keys.map(key => [catalog[key].standard, key]));
  const gradeWords = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
  const stages = { p: '小学', j: '初中', h: '高中' };
  const electives = [
    ['选必一', '选择性必修第一册'], ['选必二', '选择性必修第二册'],
    ['选必三', '选择性必修第三册'], ['选必四', '选择性必修第四册']
  ];
  const mathBooks = [['高一', '必修第一册'], ['高二', '必修第二册'], ...electives.slice(0, 3)];
  const seniorBooks = [['必修一', '必修第一册'], ['必修二', '必修第二册'], ['必修三', '必修第三册'], ...electives];

  function known(key) { return Object.hasOwn(catalog, key); }
  function fromId(id) { return byPrefix.get(String(id || '').split('_')[0]) || 'math'; }
  function fromTopic(topic) {
    return topic && known(topic.subject) ? topic.subject : fromId(topic && topic.id);
  }
  function fromStandard(id) { return byStandard.get(String(id || '').split('-')[0]) || 'math'; }

  function withSubject(href, subject) {
    if (!href || subject === 'math' || /^(?:[a-z]+:|\/\/|#)/i.test(href)) return href;
    const hashAt = href.indexOf('#');
    const path = hashAt < 0 ? href : href.slice(0, hashAt);
    if (/[?&]subject=/.test(path)) return href;
    return path + (path.includes('?') ? '&' : '?') + 'subject=' + subject + (hashAt < 0 ? '' : href.slice(hashAt));
  }

  function stage(grade) { return grade <= 6 ? 'p' : grade <= 9 ? 'j' : 'h'; }
  function grades(topics, filter) {
    return [...new Set(topics.filter(t => !t.archived && (!filter || stage(t.grade) === filter)).map(t => t.grade))]
      .sort((a, b) => a - b);
  }
  function book(subject, grade) { return (subject === 'math' ? mathBooks : seniorBooks)[grade - 10]; }
  function gradeLabel(subject, grade) {
    const b = book(subject, grade);
    return b ? b[0] : (gradeWords[grade] || grade) + '年级';
  }
  function volumeLabel(volume) {
    const grade = volume[0] + '年级';
    return volume[1] === '全' ? grade + '全一册' : grade + volume[1] + '册';
  }

  return { catalog, keys, gradeWords, stages, known, fromId, fromTopic, fromStandard,
    withSubject, stage, grades, book, gradeLabel, volumeLabel };
});
