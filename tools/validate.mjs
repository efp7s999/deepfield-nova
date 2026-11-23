#!/usr/bin/env node
// Checks a data file against SCHEMA.md and says, in plain words, what the page will and will not draw.
//   node tools/validate.mjs [deepfield.json]
// Exit code 0: nothing is wrong (there may be warnings). 1: something in the file will not be drawn, or the file cannot be read.
// No dependencies. Node 18 or newer.
import { readFileSync } from 'node:fs';

const file = process.argv[2] || 'deepfield.json';
const LIMIT = { nodes: 512, groups: 32, links: 1024, metrics: 12, detail: 16, moons: 24 };
try {                                           // if the LIMITS block in index.html has been raised, go by what the page will really draw
  const page = readFileSync(new URL('../index.html', import.meta.url), 'utf8'), m = /const LIMITS = \{([^}]*)\}/.exec(page);
  if (m) for (const [, k, v] of m[1].matchAll(/(\w+):\s*(\d+)/g)) if (k in LIMIT) LIMIT[k] = Number(v);
} catch (e) {}
const KNOWN = new Set(['ok', 'up', 'online', 'healthy', 'running', 'active', 'good', 'green', 'pass', 'warn', 'warning', 'degraded', 'stale', 'yellow', 'amber',
  'bad', 'down', 'error', 'failed', 'failing', 'critical', 'crit', 'red', 'off', 'offline', 'stopped', 'inactive', 'disabled', 'paused', 'unknown']);
const errors = [], warnings = [];
const err = m => errors.push(m), warn = m => warnings.push(m);
const isObj = v => v && typeof v === 'object' && !Array.isArray(v), isNum = v => typeof v === 'number' && Number.isFinite(v);
const state = (v, where) => { if (v != null && v !== '' && !KNOWN.has(String(v).toLowerCase().trim())) warn(`${where}: status "${v}" is not one the page knows, so it will show as unknown`); };

let text, data;
try { text = readFileSync(file, 'utf8'); } catch (e) { console.error(`Cannot read ${file}: ${e.message}`); process.exit(1); }
try { data = JSON.parse(text); } catch (e) { console.error(`${file} is not valid JSON: ${e.message}\nThe page will keep showing what it last read.`); process.exit(1); }
if (!isObj(data)) { console.error(`${file} must be one JSON object with a "nodes" array.`); process.exit(1); }

const ids = new Set();
if (!Array.isArray(data.nodes) || !data.nodes.length) err('"nodes" is missing or empty: there is nothing to draw');
else data.nodes.forEach((n, i) => {
  const where = `nodes[${i}]`;
  if (!isObj(n)) return err(`${where} is not an object and will not be drawn`);
  const id = String(n.id ?? n.name ?? n.label ?? '').trim(), at = id ? `node "${id}"` : where;
  if (!id) return err(`${where} has no "id" and will not be drawn`);
  if (ids.has(id)) return err(`${at}: this id is used twice; the second one will not be drawn`);
  ids.add(id);
  if (n.id == null) warn(`${at}: no "id", so its ${n.name != null ? 'name' : 'label'} is used as one. Give it a stable id if the label can change`);
  state(n.status, at);
  if (n.status == null) warn(`${at}: no "status", so it shows as unknown`);
  if (n.weight != null && !(isNum(n.weight) && n.weight > 0)) warn(`${at}: "weight" should be a number above 0; it will be treated as 1`);
  const metrics = Array.isArray(n.metrics) ? n.metrics : isObj(n.metrics) ? Object.entries(n.metrics).map(([label, v]) => isObj(v) ? { label, ...v } : { label, value: v }) : n.metrics == null ? [] : null;
  if (metrics === null) warn(`${at}: "metrics" should be an array or an object; it is ignored`);
  else {
    if (metrics.length > LIMIT.metrics) warn(`${at}: ${metrics.length} metrics, only the first ${LIMIT.metrics} are shown`);
    metrics.forEach(m => {
      if (!isObj(m) || m.label == null) return warn(`${at}: a metric without a "label" is ignored`);
      if (m.value != null && !isNum(m.value)) warn(`${at}: metric "${m.label}" has a value that is not a number, so it shows as a dash unless it has "text"`);
      else if (isNum(m.value) && !(isNum(m.max) && m.max > 0) && (m.value < 0 || m.value > 1)) warn(`${at}: metric "${m.label}" is ${m.value} with no "max", so it gets no bar. Use a share from 0 to 1, or add "max"`);
      state(m.status, `${at}, metric "${m.label}"`);
    });
  }
  if (n.detail != null && !isObj(n.detail) && !Array.isArray(n.detail)) warn(`${at}: "detail" should be an object of name and value; it is ignored`);
  if (n.moons != null && !Array.isArray(n.moons)) warn(`${at}: "moons" should be an array; it is ignored`);
  else (n.moons || []).forEach(m => { if (isObj(m)) { if (m.label == null && m.name == null) warn(`${at}: a moon without a "label" is ignored`); state(m.status, `${at}, moon "${m.label ?? m.name}"`); } });
  if ((n.moons || []).length > LIMIT.moons) warn(`${at}: ${n.moons.length} moons, only the first ${LIMIT.moons} are listed and 8 drawn`);
  if (n.problems != null && !Array.isArray(n.problems)) warn(`${at}: "problems" should be an array of strings; it is ignored`);
  if (String(n.status).toLowerCase() === 'ok' && Array.isArray(n.problems) && n.problems.length) warn(`${at}: has problems listed but its status is ok, so the star will not look troubled`);
});
if (ids.size > LIMIT.nodes) warn(`${ids.size} nodes, only the first ${LIMIT.nodes} are drawn. Gather small ones into one node with moons, or raise LIMITS in index.html (AGENTS.md, "Scaling up")`);

const groups = new Set();
if (data.groups != null && !Array.isArray(data.groups)) warn('"groups" should be an array; it is ignored');
(Array.isArray(data.groups) ? data.groups : []).forEach((g, i) => { if (!isObj(g) || g.id == null) return warn(`groups[${i}] has no "id" and is ignored`); groups.add(String(g.id).trim()); state(g.status, `group "${g.id}"`); });
(Array.isArray(data.nodes) ? data.nodes : []).forEach(n => { if (isObj(n)) groups.add(String(n.group ?? '').trim()); });
if (groups.size > LIMIT.groups) warn(`${groups.size} groups, the sky has room for ${LIMIT.groups}: the smallest will be drawn together as one galaxy`);

let links = 0;
if (data.links != null && !Array.isArray(data.links)) warn('"links" should be an array; it is ignored');
(Array.isArray(data.links) ? data.links : []).forEach((l, i) => {
  const where = `links[${i}]`;
  if (!isObj(l)) return err(`${where} is not an object and will not be drawn`);
  const a = String(l.from ?? '').trim(), b = String(l.to ?? '').trim();
  if (!ids.has(a) || !ids.has(b)) return err(`${where} (${a || '?'} to ${b || '?'}) names a node that is not in "nodes" and will not be drawn`);
  if (a === b) return err(`${where} links "${a}" to itself and will not be drawn`);
  if (l.rate != null && !(isNum(l.rate) && l.rate >= 0 && l.rate <= 1)) warn(`${where}: "rate" should be from 0 to 1`);
  state(l.status, where); links++;
});
if (links > LIMIT.links) warn(`${links} links, only the first ${LIMIT.links} are drawn. Merge parallel links, or raise LIMITS in index.html`);

let alerts = 0;
if (data.alerts != null && !Array.isArray(data.alerts)) warn('"alerts" should be an array; it is ignored');
(Array.isArray(data.alerts) ? data.alerts : []).forEach((a, i) => {
  if (!isObj(a) || a.text == null) return warn(`alerts[${i}] has no "text" and is ignored`);
  if (a.node != null && !ids.has(String(a.node).trim())) warn(`alerts[${i}] names node "${a.node}", which is not in "nodes"; it is shown without one`);
  if (a.level != null && !['bad', 'warn', 'info'].includes(String(a.level).toLowerCase()) && !KNOWN.has(String(a.level).toLowerCase())) warn(`alerts[${i}]: level "${a.level}" is not bad, warn or info; it is treated as warn`);
  alerts++;
});

const gen = isNum(data.generated) ? data.generated : typeof data.generated === 'string' ? Date.parse(data.generated) / 1000 : NaN;
if (data.generated == null) warn('no "generated" time, so the page cannot say how old the data is or notice that it has gone stale');
else if (!Number.isFinite(gen)) warn('"generated" should be unix seconds or an ISO 8601 time; as it is, the age cannot be shown');
else if (gen > 1e12) warn('"generated" looks like milliseconds; it should be seconds');

// This file is fetched by every browser that opens the page. Flag anything that looks like it should not be there.
const SECRET_KEY = /pass(word|wd)?|secret|token|api[_-]?key|private[_-]?key|credential|bearer/i;
const SECRET_VALUE = /-----BEGIN [A-Z ]*PRIVATE KEY|AKIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9]{30,}|sk-[A-Za-z0-9_-]{20,}|xox[baprs]-[A-Za-z0-9-]{10,}|eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\./;
(function scan(v, path) {
  if (typeof v === 'string') { if (SECRET_VALUE.test(v)) warn(`${path} looks like a credential. Anyone who can open the page can read this file: take it out`); }
  else if (Array.isArray(v)) v.forEach((x, i) => scan(x, `${path}[${i}]`));
  else if (isObj(v)) for (const [k, x] of Object.entries(v)) { if (SECRET_KEY.test(k) && x != null && x !== '') warn(`${path}.${k}: a field with this name does not belong in a file every viewer can read`); scan(x, `${path}.${k}`); }
})(data, 'file');

for (const m of errors) console.log('ERROR    ' + m);
const seen = new Map();                         // the same remark about hundreds of nodes is printed three times, then counted
for (const m of warnings){
  const kind = m.replace(/"[^"]*"/g, '"…"').replace(/\d+(\.\d+)?/g, '#'), n = (seen.get(kind) || 0) + 1; seen.set(kind, n);
  if (n <= 3) console.log('warning  ' + m);
}
for (const [kind, n] of seen) if (n > 3) console.log(`warning  … and ${n - 3} more like: ${kind}`);
const sum = `${ids.size} node${ids.size === 1 ? '' : 's'} in ${groups.size} group${groups.size === 1 ? '' : 's'}, ${links} link${links === 1 ? '' : 's'}, ${alerts} alert${alerts === 1 ? '' : 's'}`;
console.log(errors.length ? `\n${file}: ${errors.length} error${errors.length === 1 ? '' : 's'}, ${warnings.length} warning${warnings.length === 1 ? '' : 's'}. ${sum} will be drawn.`
  : `${warnings.length ? '\n' : ''}${file} is fine: ${sum}${warnings.length ? `, with ${warnings.length} warning${warnings.length === 1 ? '' : 's'}` : ''}.`);
process.exit(errors.length ? 1 : 0);
