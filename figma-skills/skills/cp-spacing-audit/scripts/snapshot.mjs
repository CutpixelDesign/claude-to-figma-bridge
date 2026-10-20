#!/usr/bin/env node
// Снимок из Figma через Claude Bridge: layout всех слоёв выделения, переменные, стили.
// Сырой JSON сохраняется в файлы, в вывод идёт компактное дерево — чтобы не читать JSON целиком.
//
//   node snapshot.mjs                — текущее выделение
//   node snapshot.mjs 217:5882 …     — конкретные слои
//   --depth N                        — ограничить глубину дерева в выводе
//   --no-tree                        — только сводка и пути к файлам

import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const BRIDGE = process.env.CP_BRIDGE_URL || 'http://localhost:3571';
// Built skills live in <repo>/figma-skills/skills/<skill>/scripts/; the server is <repo>/server/.
// Node resolves the ~/.claude/skills symlink, so this path points into the real repo.
const BRIDGE_SERVER = process.env.CP_BRIDGE_SERVER
  || resolve(dirname(fileURLToPath(import.meta.url)), '../../../../server/server.js');

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const depthArg = args.indexOf('--depth');
const maxDepth = depthArg >= 0 ? Number(args[depthArg + 1]) : Infinity;
const ids = args.filter((a, i) => /^I?\d+:\d+/.test(a) && args[i - 1] !== '--depth');

async function command(action, params = {}) {
  const res = await fetch(`${BRIDGE}/command`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...params }),
  });
  const data = await res.json();
  if (data && data.error) throw new Error(`${action}: ${data.error}`);
  return data;
}

async function checkBridge() {
  let status;
  try {
    status = await (await fetch(`${BRIDGE}/status`)).json();
  } catch {
    console.log(`Bridge server is not running. Start it:\n  node "${BRIDGE_SERVER}" &`);
    process.exit(2);
  }
  if (!status.connected) {
    console.log('Bridge server is up, but the Claude Bridge plugin is not open in Figma. Ask the user to run it.');
    process.exit(3);
  }
}

// ---------- formatting ----------

const hex = (c) => '#' + ['r', 'g', 'b'].map((k) => Math.round(c[k] * 255).toString(16).padStart(2, '0')).join('').toUpperCase();
const num = (v) => (typeof v === 'number' ? +v.toFixed(2) : v);
const SIZE = { FIXED: 'Fx', HUG: 'Hug', FILL: 'Fill' };
const CONS = { MIN: 'L', MAX: 'R', CENTER: 'C', STRETCH: 'LR', SCALE: 'S' };
const CONS_V = { MIN: 'T', MAX: 'B', CENTER: 'C', STRETCH: 'TB', SCALE: 'S' };

function paints(list) {
  return list
    .map((p) => {
      let s = p.variable ? `{${p.variable}}` : p.color || p.type;
      if (p.opacity !== undefined) s += `@${num(p.opacity)}`;
      if (p.visible === false) s += ' HIDDEN';
      return s;
    })
    .join(',');
}

function nodeLine(n, parent) {
  const p = [];
  const lm = n.layoutMode;
  if (lm && lm !== 'NONE') {
    const pad = ['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft'].map((k) => num(n[k] ?? 0));
    let s = { HORIZONTAL: 'H', VERTICAL: 'V', GRID: 'GRID' }[lm] || lm;
    if (n.layoutWrap === 'WRAP') s += ' wrap';
    if (pad.some(Boolean)) s += ` pad=${pad.join('/')}`;
    if (lm === 'GRID') {
      s += ` cols=${(n.gridColumnSizes || []).map((t) => (t.type === 'FLEX' ? `${t.value}fr` : t.type)).join(' ')} gap=${num(n.gridRowGap)}/${num(n.gridColumnGap)}`;
    } else if ((n.childCount || 0) > 1) {
      const dist = ['SPACE_BETWEEN', 'SPACE_AROUND', 'SPACE_EVENLY'].includes(n.primaryAxisAlignItems);
      s += dist ? ` ${n.primaryAxisAlignItems.toLowerCase()}` : ` gap=${num(n.itemSpacing)}`;
      if (n.layoutWrap === 'WRAP') s += `/${num(n.counterAxisSpacing)}`;
    }
    s += ` align=${(n.primaryAxisAlignItems || '').slice(0, 3)}/${(n.counterAxisAlignItems || '').slice(0, 3)}`;
    if (n.strokesIncludedInLayout && n.strokes) s += ' strokeInLayout';
    p.push(s);
  }
  if (n.layoutSizingHorizontal) p.push(`${SIZE[n.layoutSizingHorizontal]}×${SIZE[n.layoutSizingVertical]}`);
  for (const k of ['minWidth', 'maxWidth', 'minHeight', 'maxHeight']) if (n[k] != null) p.push(`${k}=${n[k]}`);
  if (n.layoutPositioning === 'ABSOLUTE') p.push('ABS');
  // Constraints only matter outside auto layout flow.
  const inFlow = parent && parent.layoutMode && parent.layoutMode !== 'NONE' && n.layoutPositioning !== 'ABSOLUTE';
  if (n.constraints && parent && !inFlow) p.push(`cons=${CONS[n.constraints.horizontal]}/${CONS_V[n.constraints.vertical]}`);
  if (n.lockAspectRatio) p.push('lockAR');
  if (n.type === 'TEXT') {
    const lh = n.lineHeight || {};
    p.push(`text=${n.textAutoResize} ${n.fontSize}/${lh.unit === 'PERCENT' ? num(lh.value) + '%' : lh.unit === 'PIXELS' ? lh.value + 'px' : 'auto'} style=${n.textStyleId ? 'yes' : 'NO'}`);
    if (n.textTruncation === 'ENDING') p.push(`truncate maxLines=${n.maxLines}`);
  }
  if (n.visible === false) p.push('HIDDEN');
  if (n.opacity !== undefined) p.push(`opacity=${num(n.opacity)}`);
  if (n.cornerRadius !== undefined) p.push(`r=${n.cornerRadius}`);
  if (n.clipsContent) p.push('clip');
  if (n.fills) p.push(`fill=${paints(n.fills)}`);
  if (n.strokes) {
    let sw = n.strokeWeight;
    if (sw === 'mixed') sw = ['strokeTopWeight', 'strokeRightWeight', 'strokeBottomWeight', 'strokeLeftWeight'].map((k) => n[k]).join('/');
    p.push(`stroke=${paints(n.strokes)} w=${sw}`);
  }
  if (n.effects) p.push(`fx=${n.effects.map((e) => e.type + (e.radius ? e.radius : '')).join(',')}${n.effectStyleId ? ' (style)' : ''}`);
  if (n.bound) {
    const b = Object.entries(n.bound).filter(([k]) => !['fontFamily', 'fontWeight', 'fontSize', 'characters'].includes(k));
    if (b.length) p.push(`bound{${b.map(([k, v]) => `${k}:${[].concat(v).join('|')}`).join(', ')}}`);
  }
  if (n.component) p.push(`comp=${n.component.name}${n.component.variant ? JSON.stringify(n.component.variant) : ''}${n.component.detached ? ' DETACHED' : ''}`);
  const text = n.characters ? ` "${n.characters.slice(0, 30)}"` : '';
  const geo = `${num(n.x)},${num(n.y)} ${num(n.width)}×${num(n.height)}`;
  return `${'  '.repeat(n.depth)}${n.type.slice(0, 4)} "${n.name}"${text} [${n.id}] ${geo} | ${p.join(' ')}`;
}

function variablesSummary(collections) {
  const lines = [];
  for (const c of collections) {
    const vars = c.variables.filter((v) => v.type === 'COLOR' || v.type === 'FLOAT');
    const skipped = c.variables.length - vars.length;
    lines.push(`== ${c.name} [${c.modes.map((m) => m.name).join(', ')}] ${c.variables.length} vars${skipped ? ` (${skipped} non-color/number skipped)` : ''}`);
    for (const v of vars) {
      const vals = Object.values(v.values).map((x) => {
        if (x && x.alias) return `→${x.alias}`;
        if (x && typeof x === 'object' && 'r' in x) return hex(x) + (x.a !== undefined && x.a !== 1 ? `@${num(x.a)}` : '');
        return typeof x === 'object' ? JSON.stringify(x) : x;
      });
      const scopes = v.scopes && v.scopes.join(',') !== 'ALL_SCOPES' ? ` scopes=${v.scopes.join(',') || 'hidden'}` : '';
      lines.push(`   ${v.name} = ${[...new Set(vals)].join(' | ')}${scopes}`);
    }
  }
  return lines.join('\n');
}

// ---------- main ----------

await checkBridge();

let roots = ids;
if (!roots.length) {
  const sel = await command('get_selection');
  if (!sel.length) {
    console.log('Nothing is selected in Figma.');
    process.exit(4);
  }
  roots = sel.map((n) => n.id);
}

const dir = join(tmpdir(), 'cp-figma', new Date().toISOString().replace(/[:.]/g, '-'));
mkdirSync(dir, { recursive: true });

const layouts = [];
for (const id of roots) {
  const data = await command('get_layout', { nodeId: id, deep: true });
  writeFileSync(join(dir, `layout-${id.replace(/[:;]/g, '_')}.json`), JSON.stringify(data));
  layouts.push(data);
}
const variables = await command('get_variables');
const styles = await command('get_local_styles');
writeFileSync(join(dir, 'variables.json'), JSON.stringify(variables));
writeFileSync(join(dir, 'styles.json'), JSON.stringify(styles));

console.log(`Snapshot saved to ${dir}`);
for (const l of layouts) {
  const r = l.nodes[0];
  console.log(`Root "${r.name}" [${r.id}] ${num(r.width)}×${num(r.height)} — ${l.count} layers`);
}
console.log(`Styles: ${Object.entries(styles).map(([k, v]) => `${k} ${v.length}`).join(', ')}`);
if (styles.text && styles.text.length) console.log(`  text: ${styles.text.map((s) => s.name).join(', ')}`);
console.log(`\nVariables:\n${variablesSummary(variables)}`);

if (!flag('--no-tree')) {
  console.log('\nLegend: H/V/GRID auto layout · pad=T/R/B/L · Fx/Hug/Fill = width×height · cons=H/V (L R C LR S / T B C TB S) · {var} = bound variable ([library: …] from a library, [stale: …] collection gone from the file) · ABS = absolute');
  for (const l of layouts) {
    console.log('');
    const byId = new Map(l.nodes.map((n) => [n.id, n]));
    for (const n of l.nodes) if (n.depth <= maxDepth) console.log(nodeLine(n, byId.get(n.parentId)));
  }
}
