#!/usr/bin/env node
// Joins several data files into one, for when each machine or each adapter writes its own.
//
//   node tools/merge.mjs --out deepfield.json [--title "My estate"] [--max-age 300] part1.json part2.json …
//
// Nodes, groups, links and alerts are put together; on a repeated id the first file wins.
// A part whose own "generated" time is older than --max-age seconds (or that cannot be read) is not passed off as healthy:
// its nodes are marked unknown, with a problem saying how long it has been silent. No dependencies. Node 18 or newer.
import { readFileSync, writeFileSync, renameSync } from 'node:fs';

const argv = process.argv.slice(2), flag = (name, fallback) => { const i = argv.indexOf('--' + name); return i < 0 ? fallback : argv.splice(i, 2)[1]; };
const out = flag('out', 'deepfield.json'), title = flag('title', ''), maxAge = Number(flag('max-age', 300)), parts = argv;
if (!parts.length) { console.error('Usage: node tools/merge.mjs --out deepfield.json [--title "…"] [--max-age 300] part1.json part2.json …'); process.exit(1); }

const now = Date.now() / 1000, merged = { title, generated: Math.floor(now), groups: [], nodes: [], links: [], alerts: [] }, seen = { nodes: new Set(), groups: new Set() };
const ago = s => s < 120 ? Math.round(s) + ' s' : s < 7200 ? Math.round(s / 60) + ' min' : s < 172800 ? (s / 3600).toFixed(1) + ' h' : Math.round(s / 86400) + ' d';
let silent = 0;
for (const file of parts) {
  let d;
  try { d = JSON.parse(readFileSync(file, 'utf8')); } catch (e) { merged.alerts.push({ level: 'warn', text: `${file} could not be read: ${e.message}` }); silent++; continue; }
  const gen = typeof d.generated === 'number' ? d.generated : Date.parse(d.generated) / 1000, age = Number.isFinite(gen) ? now - gen : null, stale = age != null && age > maxAge;
  if (stale) silent++;
  if (!merged.title && d.title) merged.title = d.title;
  for (const g of Array.isArray(d.groups) ? d.groups : []) if (g && g.id != null && !seen.groups.has(String(g.id))) { seen.groups.add(String(g.id)); merged.groups.push(g); }
  for (const n of Array.isArray(d.nodes) ? d.nodes : []) {
    const id = n && String(n.id ?? n.name ?? n.label ?? ''); if (!id || seen.nodes.has(id)) continue; seen.nodes.add(id);
    merged.nodes.push(stale ? { ...n, status: 'unknown', problems: [`no report for ${ago(age)}; what is shown is the last one`].concat(Array.isArray(n.problems) ? n.problems : []) } : n);
  }
  if (Array.isArray(d.links)) merged.links.push(...d.links);
  if (Array.isArray(d.alerts)) merged.alerts.push(...d.alerts);
}
writeFileSync(out + '.tmp', JSON.stringify(merged)); renameSync(out + '.tmp', out);   // written whole, then swapped in: the page never reads half a file
console.log(`${new Date().toISOString().slice(11, 19)}  wrote ${out}: ${merged.nodes.length} nodes from ${parts.length} files${silent ? `, ${silent} of them stale or unreadable` : ''}`);
