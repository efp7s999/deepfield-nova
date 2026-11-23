#!/usr/bin/env node
// A folder of Markdown notes (an Obsidian vault, a Logseq graph, any second brain) → deepfield.json.
// Top-level folders become galaxies, notes become stars, links between notes become links, a note's headings become its moons.
//
//   node adapters/markdown-vault.mjs <folder> [--out deepfield.json] [--watch 30] [--dormant 180] [--title "My notes"]
//
//   --watch N     scan again every N seconds (otherwise: once, then exit)
//   --dormant N   a note untouched for N days is drawn as a cold, dim star (default 180)
//
// It only reads. No note is ever changed. No dependencies. Node 18 or newer.
// Mind what you publish: the output holds your notes' titles, paths and headings, and anyone who can open the page can read it.
import { readdirSync, readFileSync, statSync, writeFileSync, renameSync } from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2), flag = (name, fallback) => { const i = argv.indexOf('--' + name); return i < 0 ? fallback : argv.splice(i, 2)[1]; };
const out = flag('out', 'deepfield.json'), watch = Number(flag('watch', 0)), dormant = Number(flag('dormant', 180)), titleArg = flag('title', ''), max = Math.max(1, Number(flag('max', 300)) || 300), root = argv[0];
if (!root) { console.error('Usage: node adapters/markdown-vault.mjs <folder> [--out deepfield.json] [--watch 30] [--dormant 180] [--max 300] [--title "My notes"]'); process.exit(1); }
const MAX_NODES = max, MAX_GROUPS = 24, MAX_LINKS = max * 2, MAX_FILES = 20000;   // --max: how many notes to draw, the best-connected first. The page itself draws up to 512 nodes and 1,024 links unless its LIMITS are raised

function walk(dir, list = []) {                 // every .md file under dir; hidden folders and node_modules are skipped
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.') || e.name === 'node_modules' || list.length >= MAX_FILES) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, list); else if (e.isFile() && /\.(md|markdown)$/i.test(e.name)) list.push(p);
  }
  return list;
}
const key = s => s.replace(/\\/g, '/').replace(/\.(md|markdown)$/i, '').trim().toLowerCase();
const since = days => days < 1 ? 'today' : days < 2 ? 'yesterday' : days < 60 ? Math.floor(days) + ' days ago' : days < 730 ? Math.floor(days / 30) + ' months ago' : Math.floor(days / 365) + ' years ago';

function scan() {
  const now = Date.now(), notes = walk(root).map(file => {
    const raw = readFileSync(file, 'utf8'), rel = path.relative(root, file).split(path.sep).join('/'), id = rel.replace(/\.(md|markdown)$/i, '');
    const text = raw.replace(/^---\n[\s\S]*?\n---\n/, '').replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '');   // front matter and code are not prose: links in them do not count
    const targets = [];
    for (const m of text.matchAll(/(!?)\[\[([^\]\n]+)\]\]/g)) {                                   // [[Note]], [[Note|shown]], [[Note#Heading]]
      const t = m[2].split('|')[0].split('#')[0].split('^')[0].trim();
      if (t && !(m[1] && /\.[a-z0-9]{2,5}$/i.test(t) && !/\.md$/i.test(t))) targets.push({ t, wiki: true });   // an embedded image is not a link to a note
    }
    for (const m of text.matchAll(/\]\(([^)\s]+\.(?:md|markdown))(?:#[^)]*)?\)/gi)) {              // [text](other/note.md)
      if (!/^[a-z]+:/i.test(m[1])) { let t = m[1]; try { t = decodeURIComponent(t); } catch {} targets.push({ t: path.posix.normalize(path.posix.join(path.posix.dirname(rel), t)), wiki: false }); }
    }
    return { id, name: path.basename(id), group: id.includes('/') ? id.split('/')[0] : '', days: (now - statSync(file).mtimeMs) / 864e5,
      words: (text.match(/\S+/g) || []).length, tasks: (text.match(/^\s*[-*+] \[ \]/gm) || []).length,
      headings: [...text.matchAll(/^#{2}\s+(.+?)\s*#*$/gm)].map(m => m[1]).slice(0, 8), targets, out: new Map(), inbound: 0, broken: [] };
  });
  // A link names its note by path or, as Obsidian does, by file name alone. With two notes of one name, the shorter path wins.
  const byPath = new Map(notes.map(n => [key(n.id), n])), byName = new Map();
  for (const n of [...notes].sort((a, b) => a.id.length - b.id.length)) if (!byName.has(key(n.name))) byName.set(key(n.name), n);
  for (const n of notes) for (const { t, wiki } of n.targets) {
    const to = byPath.get(key(t)) || (wiki ? byName.get(key(path.posix.basename(t))) : null);
    if (!to) { if (!n.broken.includes(t)) n.broken.push(t); } else if (to !== n) { n.out.set(to, (n.out.get(to) || 0) + 1); to.inbound++; }
  }
  // Only so many stars fit. Keep the notes most woven into the rest, then the most recently touched, then the longest.
  const score = n => n.inbound * 2 + n.out.size + (n.days < 7 ? 3 : 0) + Math.log10(n.words + 1);
  const shown = [...notes].sort((a, b) => score(b) - score(a) || (a.id < b.id ? -1 : 1)).slice(0, MAX_NODES), keep = new Set(shown);
  const sizes = new Map(); for (const n of shown) sizes.set(n.group, (sizes.get(n.group) || 0) + 1);
  const big = new Set([...sizes].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, sizes.size > MAX_GROUPS ? MAX_GROUPS - 1 : MAX_GROUPS).map(g => g[0]));
  const groupOf = n => big.has(n.group) ? n.group || '(top level)' : 'other folders';
  const links = [];
  for (const n of shown) for (const [to, count] of n.out) if (keep.has(to)) links.push({ from: n.id, to: to.id, kind: 'link', rate: Math.min(1, 0.2 + 0.2 * count), count, pull: to.inbound });
  links.sort((a, b) => b.count - a.count || b.pull - a.pull || (a.from + a.to < b.from + b.to ? -1 : 1));
  const data = {
    title: (titleArg || path.basename(path.resolve(root))) + (notes.length > shown.length ? ` · ${shown.length} of ${notes.length} notes` : ''),
    generated: Math.floor(now / 1000),
    groups: [...new Set(shown.map(groupOf))].sort().map(g => ({ id: g, label: g })),
    nodes: shown.sort((a, b) => a.id < b.id ? -1 : 1).map(n => ({
      id: n.id, label: n.name, group: groupOf(n), kind: 'note',
      status: n.days > dormant ? 'off' : n.broken.length ? 'warn' : 'ok',
      weight: 1 + n.inbound,
      metrics: [{ label: 'words', text: n.words.toLocaleString('en') }, { label: 'links in', text: String(n.inbound) }, { label: 'links out', text: String(n.out.size) }]
        .concat(n.tasks ? [{ label: 'open tasks', text: String(n.tasks) }] : []),
      detail: { edited: since(n.days), path: n.id },
      moons: n.headings.map(h => ({ label: h, status: 'ok' })),
      problems: n.broken.length ? [`${n.broken.length} link${n.broken.length === 1 ? ' points' : 's point'} to a note that does not exist: ${n.broken.slice(0, 4).join(', ')}${n.broken.length > 4 ? ', …' : ''}`] : [],
    })),
    links: links.slice(0, MAX_LINKS).map(({ from, to, kind, rate }) => ({ from, to, kind, rate })),
  };
  writeFileSync(out + '.tmp', JSON.stringify(data)); renameSync(out + '.tmp', out);   // written whole, then swapped in: the page never reads half a file
  console.log(`${new Date().toISOString().slice(11, 19)}  wrote ${out}: ${shown.length} of ${notes.length} notes, ${data.groups.length} groups, ${data.links.length} links`);
}

try { scan(); } catch (e) { console.error(`Could not scan ${root}: ${e.message}`); process.exit(1); }
if (watch > 0) setInterval(() => { try { scan(); } catch (e) { console.error(e.message); } }, watch * 1000);
