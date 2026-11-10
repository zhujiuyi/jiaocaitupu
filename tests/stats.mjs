// 统计 data/*.json 的真实数字，供 README 使用（不抄旧 README 的数字）。
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import subjects from '../assets/subjects.js';

// tests/ 的父目录 = 仓库根
const DATA = join(dirname(dirname(fileURLToPath(import.meta.url))), 'data') + '/';
const read = (f) => JSON.parse(readFileSync(DATA + f, 'utf8'));

const allTopics = read('topics.json');
const archived = new Set(allTopics.filter(t => t.archived).map(t => t.id));
const topics = allTopics.filter(t => !t.archived);
const deps = read('dependencies.json');
const questions = read('questions.json').filter(q => !archived.has(q.topicId));
const standards = read('cn-curriculum-standards.json');

const sample = topics[0];
console.log('topic 字段:', Object.keys(sample).join(', '));
console.log('edge 字段:', Object.keys(deps[0]).join(', '));
console.log('question 字段:', Object.keys(questions[0]).join(', '));
console.log('standards 顶层:', Object.keys(standards).join(', '));
console.log('');

const isPrimary = (t) => /^cnm_p/.test(t.id);
const isHigh = (t) => /^cnm_h/.test(t.id);
const isJunior = (t) => /^cnm_\d+$/.test(t.id);

const math = topics.filter(t => subjects.fromTopic(t) === 'math');
const official = topics.filter((t) => !t.external);

const count = (arr, fn) => arr.reduce((m, x) => { const k = fn(x) ?? 'null'; m[k] = (m[k] || 0) + 1; return m; }, {});

const byId = new Map(topics.map((t) => [t.id, t]));
const edgeHard = deps.filter((d) => d.strength === 'hard').length;
const edgeSoft = deps.filter((d) => d.strength === 'soft').length;

const qByType = count(questions, (q) => q.type);
const qByDiff = count(questions, (q) => q.difficulty);
const qBySubject = count(questions, q => byId.has(q.topicId) ? subjects.fromTopic(byId.get(q.topicId)) : 'orphan');

const stdItems = standards.items || [];
const topicCounts = count(topics, subjects.fromTopic);
const edgeCounts = count(deps, d => subjects.fromId(d.topicId));
const stdCounts = count(stdItems, s => subjects.fromStandard(s.id));
const stdByFramework = count(stdItems, (s) => (s.id || '').split(':')[0]);
const stdByDomain = count(stdItems, (s) => {
  const m = (s.id || '').match(/^cms-\d{4}:[A-Z0-9]+\.([A-Z]+)\./);
  return m ? m[1] : 'other';
});

const mapped = official.filter((t) => Array.isArray(t.standards) && t.standards.length).length;

console.log('=== 知识点 ===');
console.log('总计', topics.length, '| 旧版归档', archived.size);
console.table(Object.fromEntries(subjects.keys.map(key => [subjects.catalog[key].name, {
  知识点: topicCounts[key], 先修边: edgeCounts[key], 题目: qBySubject[key], 课标: stdCounts[key]
}])));
console.log('数学小学', math.filter(isPrimary).length, '| 初中', math.filter(isJunior).length, '| 高中', math.filter(isHigh).length);
console.log('年级分布:', JSON.stringify(count(math, (t) => t.grade)));
console.log('领域:', JSON.stringify(count(official, (t) => t.domain)));
console.log('');
console.log('=== 先修边 ===');
console.log('总计', deps.length, '| hard', edgeHard, '| soft', edgeSoft);
console.log('跨学段:', deps.filter((d) => {
  const a = byId.get(d.topicId), b = byId.get(d.prerequisiteId);
  if (!a || !b) return false;
  return subjects.stage(a.grade) !== subjects.stage(b.grade);
}).length);
console.log('');
console.log('=== 题目 ===');
console.log('总计', questions.length);
console.log('类型:', JSON.stringify(qByType));
console.log('难度:', JSON.stringify(qByDiff));
console.log('学科:', JSON.stringify(qBySubject));
console.log('每题带 verify:', questions.filter((q) => q.verify !== undefined).length);
console.log('');
console.log('=== 课标 ===');
console.log('条目', stdItems.length, '| 版本:', JSON.stringify(stdByFramework), '| 领域:', JSON.stringify(stdByDomain));
console.log('有映射的正式知识点:', mapped, '/', official.length, `(${(mapped / official.length * 100).toFixed(1)}%)`);
