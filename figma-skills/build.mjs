#!/usr/bin/env node
// Собирает src/skills/<name>/skill.md в скилы Claude Code: skills/<name>/SKILL.md + scripts/.
//
//   node build.mjs          — собрать
//   node build.mjs --watch  — пересобирать при изменениях в src/
//   node build.mjs --link   — собрать и подключить скилы симлинками в ~/.claude/skills/
//
// Директива <!-- @include path.md --> на отдельной строке подставляет файл.
// Путь от src/ (shared/x.md) или от текущего файла (./references/x.md).
// Остальные HTML-комментарии — заметки автора, в сборке они вырезаются.
// Скрипты из src/scripts/ копируются в scripts/ каждого скила.

import { readFileSync, writeFileSync, readdirSync, mkdirSync, rmSync, existsSync, watch, cpSync, lstatSync, readlinkSync, symlinkSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const SRC = join(ROOT, 'src');
const SKILLS = join(SRC, 'skills');
const SCRIPTS = join(SRC, 'scripts');
const OUT = join(ROOT, 'skills');
const LINK_DIR = join(homedir(), '.claude', 'skills');

// Держим скилы компактными: длинный скил съедает контекст и хуже соблюдается.
const MAX_CHARS = 40_000;
const NAME_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const INCLUDE_RE = /^[ \t]*<!--\s*@include\s+(\S+)\s*-->[ \t]*$/gm;
const COMMENT_LINE_RE = /^[ \t]*<!--[\s\S]*?-->[ \t]*\n/gm;
const COMMENT_RE = /<!--[\s\S]*?-->/g;
const HEADING_RE = /^(#{1,6})\s/;
const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---\n/;

const rel = (p) => relative(ROOT, p);

function resolveIncludes(file, stack = []) {
  if (stack.includes(file)) {
    throw new Error(`циклический include: ${[...stack, file].map(rel).join(' → ')}`);
  }
  if (!existsSync(file)) {
    throw new Error(`не найден ${rel(file)}${stack.length ? ` (include из ${rel(stack.at(-1))})` : ''}`);
  }
  return readFileSync(file, 'utf8').replace(INCLUDE_RE, (_, path) => {
    const target = path.startsWith('.') ? resolve(dirname(file), path) : join(SRC, path);
    return resolveIncludes(target, [...stack, file]).trim();
  });
}

// Убирает заголовки без содержимого — секции, где пока одни TODO, не попадают в dist.
function dropEmptySections(text) {
  const lines = text.split('\n');
  const keep = lines.map(() => true);
  let inFence = false;
  const isHeading = lines.map((line) => {
    if (/^\s*```/.test(line)) inFence = !inFence;
    const m = !inFence && line.match(HEADING_RE);
    return m ? m[1].length : 0;
  });
  // С конца, чтобы родитель, у которого остались только пустые подсекции, тоже удалился.
  for (let i = lines.length - 1; i >= 0; i--) {
    if (!isHeading[i]) continue;
    let j = i + 1;
    while (j < lines.length && (!keep[j] || !lines[j].trim())) j++;
    if (j === lines.length || (isHeading[j] && isHeading[j] <= isHeading[i])) keep[i] = false;
  }
  return lines.filter((_, i) => keep[i]).join('\n');
}

// Минимальный YAML: `key: value` и блочные `key: >` / `key: |`.
function parseFrontmatter(yaml) {
  const data = {};
  const lines = yaml.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^([\w-]+):\s*(.*)$/);
    if (!m) continue;
    let [, key, value] = m;
    if (/^[>|]-?$/.test(value)) {
      const block = [];
      while (i + 1 < lines.length && /^\s+\S/.test(lines[i + 1])) block.push(lines[++i].trim());
      value = block.join(value.startsWith('>') ? ' ' : '\n');
    } else {
      value = value.replace(/^(['"])(.*)\1$/, '$2');
    }
    data[key] = value;
  }
  return data;
}

function buildSkill(dir) {
  const errors = [];
  const warnings = [];
  const file = join(SKILLS, dir, 'skill.md');

  let text = resolveIncludes(file);
  const todos = (text.match(/\bTODO\b/g) || []).length;
  text = text.replace(COMMENT_LINE_RE, '').replace(COMMENT_RE, '').replace(/[ \t]+$/gm, '');

  const fm = text.match(FRONTMATTER_RE);
  if (!fm) {
    errors.push('нет frontmatter (--- name / description ---)');
    return { dir, errors, warnings, todos };
  }
  text = fm[0] + dropEmptySections(text.slice(fm[0].length));
  text = text.replace(/\n{3,}/g, '\n\n').trim() + '\n';
  const { name, description } = parseFrontmatter(fm[1]);

  if (!name) errors.push('нет name');
  else {
    if (!NAME_RE.test(name)) errors.push(`name "${name}" — только a-z, 0-9 и дефисы`);
    if (name.length > 64) errors.push(`name длиннее 64 символов`);
    if (name !== dir) errors.push(`name "${name}" не совпадает с папкой "${dir}"`);
  }
  if (!description) errors.push('нет description');
  else if (description.length > 1024) errors.push(`description ${description.length} > 1024 символов`);

  const body = text.slice(fm[0].length).trim();
  if (!body) warnings.push('пустое тело скила');
  if (text.length > MAX_CHARS) warnings.push(`${text.length} символов > ${MAX_CHARS}, стоит сократить`);

  if (!errors.length) {
    const dir = join(OUT, name);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'SKILL.md'), text);
    if (existsSync(SCRIPTS)) cpSync(SCRIPTS, join(dir, 'scripts'), { recursive: true });
  }
  return { dir, errors, warnings, todos, chars: text.length };
}

function build() {
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });

  const dirs = readdirSync(SKILLS, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(SKILLS, d.name, 'skill.md')))
    .map((d) => d.name)
    .sort();

  let failed = 0;
  for (const dir of dirs) {
    let result;
    try {
      result = buildSkill(dir);
    } catch (e) {
      result = { dir, errors: [e.message], warnings: [], todos: 0 };
    }
    const { errors, warnings, todos, chars } = result;
    if (errors.length) failed++;

    const status = errors.length ? '✗' : '✓';
    const meta = errors.length ? '' : `  ${chars} симв.${todos ? `, TODO: ${todos}` : ''}`;
    console.log(`${status} ${dir}${meta}`);
    for (const e of errors) console.log(`    ошибка: ${e}`);
    for (const w of warnings) console.log(`    внимание: ${w}`);
  }

  console.log(`\n${dirs.length - failed}/${dirs.length} собрано в ${rel(OUT)}/`);
  return failed;
}

// Список защищённых имён — свой на каждом компьютере, в репозиторий не попадает.
// При подключении создаём пустой файл из шаблона, если его ещё нет; существующий не трогаем.
const PROTECTED = join(homedir(), '.claude-bridge', 'protected-names.md');
function ensureProtectedNames() {
  if (existsSync(PROTECTED)) return;
  mkdirSync(dirname(PROTECTED), { recursive: true });
  cpSync(join(ROOT, 'protected-names.example.md'), PROTECTED);
  console.log(`  создан ${PROTECTED} — впишите туда названия продуктов с цифрами`);
}

// Симлинк ~/.claude/skills/<name> → skills/<name>: правки видны сразу после сборки.
function link() {
  ensureProtectedNames();
  mkdirSync(LINK_DIR, { recursive: true });
  for (const name of readdirSync(OUT)) {
    const target = join(OUT, name);
    const path = join(LINK_DIR, name);
    let current = null;
    try {
      const st = lstatSync(path);
      if (!st.isSymbolicLink()) {
        console.log(`  пропуск ${name}: в ${LINK_DIR} уже есть такая папка (не симлинк)`);
        continue;
      }
      current = readlinkSync(path);
    } catch { /* нет такого пути */ }
    if (current === target) continue;
    if (current) rmSync(path);
    symlinkSync(target, path);
    console.log(`  подключён ${name} → ${rel(target)}`);
  }
}

const failed = build();
if (process.argv.includes('--link')) link();

if (process.argv.includes('--watch')) {
  console.log('Слежу за src/ …');
  let timer;
  watch(SRC, { recursive: true }, () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      console.log(`\n— ${new Date().toLocaleTimeString()} —`);
      build();
    }, 150);
  });
} else if (failed) {
  process.exit(1);
}
