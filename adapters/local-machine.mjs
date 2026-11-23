#!/usr/bin/env node
// This machine → a data file with one node: processor, memory, disks, uptime. The smallest adapter there is, and a pattern to copy.
//
//   node adapters/local-machine.mjs [--out deepfield.json] [--watch 10] [--name myhost] [--group home] [--disks /,/home] [--warn-disk 0.9]
//
// For several machines: run this on each with --out pointing somewhere shared (or copy the files over), then join them:
//   node tools/merge.mjs --out deepfield.json parts/*.json
//
// It only reads. No dependencies. Node 18.15 or newer (for disk figures).
import os from 'node:os';
import { statfsSync, writeFileSync, renameSync } from 'node:fs';

const argv = process.argv.slice(2), flag = (name, fallback) => { const i = argv.indexOf('--' + name); return i < 0 ? fallback : argv[i + 1]; };
const out = flag('out', 'deepfield.json'), watch = Number(flag('watch', 0)), name = flag('name', os.hostname()), group = flag('group', ''), warnDisk = Number(flag('warn-disk', 0.9));
const disks = flag('disks', process.platform === 'win32' ? 'C:\\' : '/').split(',').map(s => s.trim()).filter(Boolean);
const gb = bytes => (bytes / 2 ** 30).toFixed(bytes < 10 * 2 ** 30 ? 1 : 0);
const ticks = () => os.cpus().reduce((s, c) => { const t = c.times; s.busy += t.user + t.nice + t.sys + t.irq; s.all += t.user + t.nice + t.sys + t.irq + t.idle; return s; }, { busy: 0, all: 0 });

async function snapshot() {
  const a = ticks(); await new Promise(r => setTimeout(r, 400)); const b = ticks();   // processor use is a difference between two readings, on every platform
  const metrics = [], problems = [];
  if (b.all > a.all) metrics.push({ label: 'cpu', value: (b.busy - a.busy) / (b.all - a.all) });
  const total = os.totalmem(), free = os.freemem();
  if (total > 0) metrics.push({ label: 'memory', value: total - free, max: total, text: `${gb(total - free)} of ${gb(total)} GB` });
  for (const mount of disks) {
    try {
      const s = statfsSync(mount), size = s.blocks * s.bsize, used = size - s.bavail * s.bsize;
      if (size > 0) { metrics.push({ label: 'disk ' + mount, value: used, max: size, text: `${gb(used)} of ${gb(size)} GB` }); if (used / size >= warnDisk) problems.push(`disk ${mount} is ${Math.round(used / size * 100)}% full`); }
    } catch (e) { metrics.push({ label: 'disk ' + mount }); }             // could not be read: left unmeasured, which the page shows as a dash, never as zero
  }
  const up = os.uptime(), data = {
    generated: Math.floor(Date.now() / 1000),
    nodes: [{ id: name, group, kind: os.type().toLowerCase(), status: problems.length ? 'warn' : 'ok', weight: Math.max(1, Math.log2(total / 2 ** 30 + 1)), metrics, problems,
      detail: { uptime: up < 172800 ? (up / 3600).toFixed(1) + ' h' : Math.floor(up / 86400) + ' d', system: `${os.type()} ${os.release()}`, cores: String(os.cpus().length) } }],
  };
  writeFileSync(out + '.tmp', JSON.stringify(data)); renameSync(out + '.tmp', out);   // written whole, then swapped in: the page never reads half a file
  console.log(`${new Date().toISOString().slice(11, 19)}  wrote ${out}: ${name}, ${problems.length ? problems.join('; ') : 'ok'}`);
}

await snapshot();
if (watch > 0) setInterval(() => snapshot().catch(e => console.error(e.message)), watch * 1000);
