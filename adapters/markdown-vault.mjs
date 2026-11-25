#!/usr/bin/env node
// A folder of Markdown notes (an Obsidian vault, a Logseq graph, any second brain) → deepfield.json, drawn as a web of linked notes.
// Notes become stars and gather round the notes they link to. Top-level folders (or tags) become galaxies, a note's headings become its moons.
//
//   node adapters/markdown-vault.mjs <folder> [--out deepfield.json] [--watch 30] [--max 500] [--group auto|folder|tag]
//                                             [--ignore "Templates,Archive"] [--dormant 180] [--strict] [--title "My notes"]
//
//   --watch N     scan again every N seconds (otherwise: once, then exit)
//   --max N       how many notes to draw, the best-connected first (default 500; the page draws 512 unless its LIMITS are raised)
//   --group       what makes a galaxy: top-level folders, or tags. auto (the default): folders, unless the vault is flat and tagged
//   --ignore      folders to leave out, by name, separated by commas
//   --dormant N   a note untouched for N days is drawn as a cold, dim star (default 180)
//   --strict      flag a note amber when it links to a note that does not exist. Off by default: in Obsidian that is how notes-to-be are made
//
// Obsidian: [[Note]], [[Note|shown]], [[Note#Heading]], [[Note^block]] and ![[Note]] are all followed. A link finds its note by path,
// by file name, or by an alias from the note's front matter. Tags come from front matter and from #tags in the text.
// .obsidian, .trash and every other hidden folder are never read, and neither are Excalidraw drawings.
//
// It only reads. No note is ever changed. No dependencies. Node 18 or newer.
// Mind what you publish: the output holds your notes' titles, paths, tags and headings, and anyone who can open the page can read it.
import { readdirSync, readFileSync, statSync, writeFileSync, renameSync } from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
const flag = (name, fallback) => { const i = argv.indexOf('--' + name); return i < 0 ? fallback : argv.splice(i, 2)[1]; };
const sw = name => { const i = argv.indexOf('--' + name); if (i < 0) return false; argv.splice(i, 1); return true; };
const out = flag('out', 'deepfield.json'), watch = Number(flag('watch', 0)), dormant = Number(flag('dormant', 180)), titleArg = flag('title', '');
const max = Math.max(1, Number(flag('max', 500)) || 500), groupArg = String(flag('group', 'auto')).toLowerCase(), strict = sw('strict');
const ignore = new Set(String(flag('ignore', '')).split(',').map(s => s.trim().toLowerCase()).filter(Boolean)), root = argv[0];
if (!root || !['auto', 'folder', 'tag'].includes(groupArg)) {
  console.error('Usage: node adapters/markdown-vault.mjs <folder> [--out deepfield.json] [--watch 30] [--max 500] [--group auto|folder|tag] [--ignore "Templates,Archive"] [--dormant 180] [--strict] [--title "My notes"]');
  process.exit(1);
}
const MAX_NODES = max, MAX_GROUPS = 24, MAX_LINKS = max * 2, MAX_FILES = 50000;

function walk(dir, list = []) {                 // every note under dir. Hidden folders (.obsidian, .trash, .git), node_modules and ignored folders are skipped
  let entries = []; try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return list; }
  for (const e of entries) {
    if (e.name.startsWith('.') || e.name === 'node_modules' || list.length >= MAX_FILES) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (!ignore.has(e.name.toLowerCase())) walk(p, list); }
    else if (e.isFile() && /\.(md|markdown)$/i.test(e.name) && !/\.excalidraw\.md$/i.test(e.name)) list.push(p);
  }
  return list;
}
const key = s => s.replace(/\\/g, '/').replace(/\.(md|markdown)$/i, '').trim().toLowerCase();
const since = days => days < 1 ? 'today' : days < 2 ? 'yesterday' : days < 60 ? Math.floor(days) + ' days ago' : days < 730 ? Math.floor(days / 30) + ' months ago' : Math.floor(days / 365) + ' years ago';

function front(raw) {                           // the YAML block at the top of a note, read just far enough to find its aliases and tags
  const m = /^﻿?---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(raw);
  if (!m) return { body: raw.replace(/^﻿/, ''), aliases: [], tags: [] };
  const list = name => {
    const k = new RegExp('^' + name + '[ \\t]*:[ \\t]*(.*)$', 'mi').exec(m[1]), found = []; if (!k) return found;
    const here = k[1].trim();
    if (here.startsWith('[')) found.push(...here.replace(/^\[|\]$/g, '').split(','));                       // tags: [a, b]
    else if (here) found.push(...(name.startsWith('tag') ? here.split(/[\s,]+/) : [here]));                 // tags: a b     aliases: One name
    else for (const line of m[1].slice(k.index + k[0].length).split(/\r?\n/).slice(1)) {                    // tags:\n  - a\n  - b
      const item = /^\s*-\s+(.*)$/.exec(line); if (item) found.push(item[1]); else if (line.trim()) break;
    }
    return found.map(v => v.trim().replace(/^["']|["']$/g, '').replace(/^#/, '').trim()).filter(Boolean);
  };
  return { body: raw.slice(m[0].length), aliases: [...list('aliases'), ...list('alias')], tags: [...list('tags'), ...list('tag')] };
}

function scan() {
  const now = Date.now(), notes = [];
  for (const file of walk(root)) {
    let raw, mtime; try { raw = readFileSync(file, 'utf8'); mtime = statSync(file).mtimeMs; } catch { continue; }   // a note that cannot be read is left out, not guessed at
    const rel = path.relative(root, file).split(path.sep).join('/'), id = rel.replace(/\.(md|markdown)$/i, ''), fm = front(raw);
    const text = fm.body.replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '');                // code is not prose: links and tags in it do not count
    const targets = [];
    for (const m of text.matchAll(/(!?)\[\[([^\]\n]+)\]\]/g)) {                                   // [[Note]], [[Note|shown]], [[Note#Heading]], ![[Note]]
      const t = m[2].split('|')[0].split('#')[0].split('^')[0].trim();
      if (t && !(/\.[a-z0-9]{2,5}$/i.test(t) && !/\.(md|markdown)$/i.test(t))) targets.push({ t, wiki: true });   // an image, a PDF or a canvas is not a note
    }
    for (const m of text.matchAll(/\]\(<?([^)\s>]+\.(?:md|markdown))>?(?:#[^)]*)?\)/gi)) {         // [text](other/note.md)
      if (!/^[a-z]+:/i.test(m[1])) { let t = m[1]; try { t = decodeURIComponent(t); } catch {} targets.push({ t: path.posix.normalize(path.posix.join(path.posix.dirname(rel), t)), wiki: false }); }
    }
    const tags = [...fm.tags];
    for (const m of text.matchAll(/(?:^|[\s(])#([\p{L}\p{N}_/-]+)/gu)) if (/[^\d/-]/.test(m[1])) tags.push(m[1].replace(/\/+$/, ''));   // #tag and #nested/tag; "#12" is a number, not a tag
    notes.push({ id, name: path.basename(id), folder: id.includes('/') ? id.split('/')[0] : '', days: (now - mtime) / 864e5, aliases: fm.aliases,
      tags: [...new Set(tags.map(t => t.toLowerCase()))], words: (text.match(/\S+/g) || []).length, tasks: (text.match(/^\s*[-*+] \[ \]/gm) || []).length,
      headings: [...text.matchAll(/^#{2}\s+(.+?)\s*#*$/gm)].map(m => m[1]).slice(0, 8), targets, out: new Map(), inbound: 0, broken: [] });
  }
  // A link names its note by path or, as Obsidian does, by file name alone; failing both, by an alias. With two notes of one name, the shorter path wins.
  const byPath = new Map(notes.map(n => [key(n.id), n])), byName = new Map(), byAlias = new Map(), shortFirst = [...notes].sort((a, b) => a.id.length - b.id.length || (a.id < b.id ? -1 : 1));
  for (const n of shortFirst) { if (!byName.has(key(n.name))) byName.set(key(n.name), n); for (const a of n.aliases) if (!byAlias.has(key(a))) byAlias.set(key(a), n); }
  for (const n of notes) for (const { t, wiki } of n.targets) {
    const base = key(path.posix.basename(t)), to = byPath.get(key(t)) || (wiki ? byName.get(base) || byAlias.get(key(t)) || byAlias.get(base) : null);
    if (!to) { if (!n.broken.includes(t)) n.broken.push(t); } else if (to !== n) { n.out.set(to, (n.out.get(to) || 0) + 1); to.inbound++; }
  }
  // What makes a galaxy. By folder, or (asked for, or in a flat vault that uses tags) by tag: of a note's tags, the one the vault uses most.
  const flat = notes.filter(n => !n.folder).length >= notes.length * 0.8, tagged = notes.filter(n => n.tags.length).length >= notes.length * 0.3;
  const by = groupArg === 'tag' || (groupArg === 'auto' && flat && tagged) ? 'tag' : 'folder', uses = new Map();
  for (const n of notes) for (const t of new Set(n.tags.map(t => t.split('/')[0]))) uses.set(t, (uses.get(t) || 0) + 1);
  for (const n of notes) n.group = by === 'folder' ? n.folder : n.tags.length ? '#' + n.tags.map(t => t.split('/')[0]).sort((a, b) => uses.get(b) - uses.get(a) || (a < b ? -1 : 1))[0] : '';
  // Only so many stars fit. Keep the notes most woven into the rest, then the most recently touched, then the longest.
  const score = n => n.inbound * 2 + n.out.size + (n.days < 7 ? 3 : 0) + Math.log10(n.words + 1);
  const shown = [...notes].sort((a, b) => score(b) - score(a) || (a.id < b.id ? -1 : 1)).slice(0, MAX_NODES), keep = new Set(shown);
  const sizes = new Map(); for (const n of shown) sizes.set(n.group, (sizes.get(n.group) || 0) + 1);
  const big = new Set([...sizes].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, sizes.size > MAX_GROUPS ? MAX_GROUPS - 1 : MAX_GROUPS).map(g => g[0]));
  const groupOf = n => big.has(n.group) ? n.group || (by === 'tag' ? '(no tag)' : '(top level)') : by === 'tag' ? 'other tags' : 'other folders';
  const links = [];
  for (const n of shown) for (const [to, count] of n.out) if (keep.has(to)) links.push({ from: n.id, to: to.id, kind: 'link', rate: Math.min(1, 0.2 + 0.2 * count), count, pull: to.inbound });
  links.sort((a, b) => b.count - a.count || b.pull - a.pull || (a.from + a.to < b.from + b.to ? -1 : 1));
  const data = {
    title: (titleArg || path.basename(path.resolve(root))) + (notes.length > shown.length ? ` · ${shown.length} of ${notes.length} notes` : ''),
    generated: Math.floor(now / 1000),
    layout: 'web',                                // gather each note round the notes it links to (SCHEMA.md, "layout")
    groups: [...new Set(shown.map(groupOf))].sort().map(g => ({ id: g, label: g })),
    nodes: shown.sort((a, b) => a.id < b.id ? -1 : 1).map(n => ({
      id: n.id, label: n.name, group: groupOf(n), kind: 'note',
      status: n.days > dormant ? 'off' : strict && n.broken.length ? 'warn' : 'ok',
      weight: 1 + n.inbound,
      metrics: [{ label: 'words', text: n.words.toLocaleString('en') }, { label: 'links in', text: String(n.inbound) }, { label: 'links out', text: String(n.out.size) }]
        .concat(n.tasks ? [{ label: 'open tasks', text: String(n.tasks) }] : []),
      detail: Object.assign({ edited: since(n.days), path: n.id }, n.tags.length ? { tags: n.tags.slice(0, 6).map(t => '#' + t).join(' ') } : {},
        n.broken.length && !strict ? { 'not written yet': n.broken.slice(0, 4).join(', ') + (n.broken.length > 4 ? ', …' : '') } : {}),
      moons: n.headings.map(h => ({ label: h, status: 'ok' })),
      problems: strict && n.broken.length ? [`${n.broken.length} link${n.broken.length === 1 ? ' points' : 's point'} to a note that does not exist: ${n.broken.slice(0, 4).join(', ')}${n.broken.length > 4 ? ', …' : ''}`] : [],
    })),
    links: links.slice(0, MAX_LINKS).map(({ from, to, kind, rate }) => ({ from, to, kind, rate })),
  };
  writeFileSync(out + '.tmp', JSON.stringify(data)); renameSync(out + '.tmp', out);   // written whole, then swapped in: the page never reads half a file
  console.log(`${new Date().toISOString().slice(11, 19)}  wrote ${out}: ${shown.length} of ${notes.length} notes, ${data.groups.length} groups by ${by}, ${data.links.length} links`);
}

try { scan(); } catch (e) { console.error(`Could not scan ${root}: ${e.message}`); process.exit(1); }
if (watch > 0) setInterval(() => { try { scan(); } catch (e) { console.error(e.message); } }, watch * 1000);
