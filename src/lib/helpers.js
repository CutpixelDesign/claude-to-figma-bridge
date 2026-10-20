// Shared helpers used across handler modules.

export function nodeInfo(n) {
  return {
    id: n.id,
    name: n.name,
    type: n.type,
    x: 'x' in n ? n.x : null,
    y: 'y' in n ? n.y : null,
    width: 'width' in n ? n.width : null,
    height: 'height' in n ? n.height : null,
    text: n.type === 'TEXT' ? n.characters : null,
  };
}

export async function buildTree(n, depth) {
  const obj = nodeInfo(n);
  if (depth > 0 && 'children' in n) {
    obj.children = [];
    for (const c of n.children) {
      obj.children.push(await buildTree(c, depth - 1));
    }
  }
  return obj;
}

// Look up a node by id and throw the standard "Node not found" error if missing.
// Replaces the `getNodeByIdAsync` + `if (!node) throw` boilerplate repeated across handlers.
export async function requireNode(id) {
  const node = await figma.getNodeByIdAsync(id);
  if (!node) throw new Error(`Node not found: ${id}`);
  return node;
}

// Resolve a scope node: the node named by scopeId, or the current page when omitted.
// Throws if an explicit scopeId points at nothing.
export async function resolveScope(scopeId) {
  if (!scopeId) return figma.currentPage;
  const node = await figma.getNodeByIdAsync(scopeId);
  if (!node) throw new Error(`Scope node not found: ${scopeId}`);
  return node;
}

// Resolve the parent for a new node BEFORE creating it, so a bad parentId fails
// loudly instead of leaving the node orphaned at the page root. Returns null when
// no parentId is given (the node stays on the current page).
export async function resolveParent(parentId) {
  if (!parentId) return null;
  const parent = await figma.getNodeByIdAsync(parentId);
  if (!parent) throw new Error(`Parent not found: ${parentId}`);
  if (!('appendChild' in parent)) throw new Error(`Parent cannot have children: ${parentId}`);
  return parent;
}

// Colors: anywhere the bridge takes a color it accepts a normalized {r,g,b} / {r,g,b,a}
// object (0–1), a CSS string — '#3366FF', '#3366FF80', 'rgb(…)', 'hsl(…)', 'oklch(…)' —
// or a color-space object like { space: 'OKLCH', l, c, h }. Strings and color-space
// objects go through figma.util, which keeps the authored color space (sourceColor).
export function isColorInput(c) {
  return typeof c === 'string' || (c !== null && typeof c === 'object' && 'space' in c);
}

export function toRGB(c) {
  return isColorInput(c) ? figma.util.rgb(c) : c;
}

// `alpha` overrides any alpha in the input; omitted, a CSS string keeps its own alpha
// and a plain object keeps its `a` (default 1).
export function toRGBA(c, alpha) {
  if (isColorInput(c)) return alpha === undefined ? figma.util.rgba(c) : figma.util.rgba(c, alpha);
  return { r: c.r, g: c.g, b: c.b, a: alpha ?? c.a ?? 1 };
}

// figma.util.solidPaint ignores an `opacity` override (the paint keeps the color's own
// alpha), so the explicit opacity is applied afterwards — it wins over alpha in the string.
export function solidPaint(c, opacity) {
  const paint = figma.util.solidPaint(c);
  return opacity === undefined || opacity === null ? paint : { ...paint, opacity };
}

// Normalize the colors inside a full Paint / Effect object (set_fills, add_effect, styles…).
export function normalizePaint(p) {
  if (!p || typeof p !== 'object') return p;
  if (p.type === 'SOLID' && isColorInput(p.color)) {
    const { color, ...rest } = p;
    return { ...figma.util.solidPaint(color), ...rest };   // overrides applied by hand (see solidPaint)
  }
  if (Array.isArray(p.gradientStops)) {
    return { ...p, gradientStops: p.gradientStops.map(s => (isColorInput(s.color) ? { ...s, color: figma.util.rgba(s.color) } : s)) };
  }
  return p;
}

export function normalizeEffect(e) {
  if (!e || typeof e !== 'object') return e;
  const out = { ...e };
  for (const k of ['color', 'secondaryColor']) if (isColorInput(out[k])) out[k] = figma.util.rgba(out[k]);
  return out;
}

// Load a font once per plugin session. A loaded font stays loaded until the plugin closes,
// and figma.loadFontAsync for one that's already loaded can hang indefinitely (seen with
// many texts in one batch) — so repeat loads are answered from this cache.
const loadedFonts = new Map();   // font key → Promise
export function loadFont(font) {
  const key = JSON.stringify([font.family, font.style, font.variationSettings ?? null]);
  if (!loadedFonts.has(key)) {
    const p = figma.loadFontAsync(font);
    loadedFonts.set(key, p);
    p.catch(() => loadedFonts.delete(key));   // a failed load may be retried
  }
  return loadedFonts.get(key);
}

// Load every font a text node uses — required before changing its characters, size,
// or any typography. Empty text nodes report no segments but still need their base font.
export async function loadNodeFonts(node) {
  const fonts = new Map();
  for (const seg of node.getStyledTextSegments(['fontName'])) {
    fonts.set(JSON.stringify(seg.fontName), seg.fontName);
  }
  if (fonts.size === 0 && node.fontName !== figma.mixed) {
    fonts.set(JSON.stringify(node.fontName), node.fontName);
  }
  await Promise.all([...fonts.values()].map(loadFont));
}

export const hex = (c) => '#' + [c.r, c.g, c.b].map(x => Math.round(x * 255).toString(16).padStart(2, '0')).join('').toUpperCase();

// '#RRGGBB' plus the alpha when it isn't 1 — a compact, readable color for responses.
// The command the plugin is running: the batch handler records its step here and stops
// when the watchdog in code.js has given up on the command (aborted).
export const runState = { current: null };

export function hexA(c) {
  const a = c.a ?? 1;
  return a === 1 ? hex(c) : hex(c) + Math.round(a * 255).toString(16).padStart(2, '0').toUpperCase();
}

// A Paint as plain, readable JSON: hex colors, gradient stops, image hashes.
// The output is accepted back by set_fills / create_paint_style / update_style.
export function describePaint(p) {
  const o = { type: p.type };
  if (p.visible === false) o.visible = false;
  if (p.opacity !== undefined && p.opacity !== 1) o.opacity = +p.opacity.toFixed(3);
  if (p.blendMode && p.blendMode !== 'NORMAL') o.blendMode = p.blendMode;
  if (p.type === 'SOLID') o.color = hex(p.color);
  if (p.gradientStops) {
    o.gradientStops = p.gradientStops.map(s => ({ position: +s.position.toFixed(4), color: hexA(s.color) }));
    o.gradientTransform = p.gradientTransform;
  }
  if (p.type === 'IMAGE') {
    o.imageHash = p.imageHash;
    o.scaleMode = p.scaleMode;
    if (p.scalingFactor !== undefined) o.scalingFactor = p.scalingFactor;
    if (p.rotation) o.rotation = p.rotation;
    if (p.filters) o.filters = p.filters;
  }
  if (p.boundVariables && Object.keys(p.boundVariables).length) o.boundVariables = p.boundVariables;
  return o;
}

// Root nodes to search: every page (allPages: true), the scopeId node, or the current page.
export async function scopeRoots(params) {
  if (params.allPages) {
    await figma.loadAllPagesAsync();
    return [...figma.root.children];
  }
  return [await resolveScope(params.scopeId)];
}

export function pageNodeOf(node) {
  let n = node;
  while (n && n.type !== 'PAGE') n = n.parent;
  return n;
}

export function pageOf(node) {
  const n = pageNodeOf(node);
  return n ? { id: n.id, name: n.name } : null;
}

// Uint8Array → base64 payload with the mime type of the export format.
const MIME = { PNG: 'image/png', JPG: 'image/jpeg', SVG: 'image/svg+xml', PDF: 'application/pdf' };
export function bytesResult(bytes, format) {
  return { base64: figma.base64Encode(bytes), mimeType: MIME[format] ?? 'application/octet-stream', bytes: bytes.length };
}

// Typography values in a friendly form: lineHeight 24 → px, '150%' → percent, 'AUTO';
// letterSpacing 2 → percent (as before), '1px' → pixels. Objects pass through.
export function parseLineHeight(v) {
  if (v === 'AUTO') return { unit: 'AUTO' };
  if (typeof v === 'number') return { value: v, unit: 'PIXELS' };
  if (typeof v === 'string' && v.endsWith('%')) return { value: parseFloat(v), unit: 'PERCENT' };
  if (typeof v === 'string' && v.endsWith('px')) return { value: parseFloat(v), unit: 'PIXELS' };
  return v;
}

export function parseLetterSpacing(v) {
  if (typeof v === 'number') return { value: v, unit: 'PERCENT' };
  if (typeof v === 'string' && v.endsWith('px')) return { value: parseFloat(v), unit: 'PIXELS' };
  if (typeof v === 'string' && v.endsWith('%')) return { value: parseFloat(v), unit: 'PERCENT' };
  return v;
}

// Paragraph-level typography shared by text nodes and text styles. Fonts must be loaded.
const TEXT_PROPS = ['paragraphSpacing', 'paragraphIndent', 'textCase', 'textDecoration', 'leadingTrim',
  'listSpacing', 'hangingPunctuation', 'hangingList', 'textWrapStyle'];
export function applyTextProps(target, params) {
  if (params.fontSize !== undefined) target.fontSize = params.fontSize;
  if (params.size !== undefined) target.fontSize = params.size;
  if (params.lineHeight !== undefined) target.lineHeight = parseLineHeight(params.lineHeight);
  if (params.letterSpacing !== undefined) target.letterSpacing = parseLetterSpacing(params.letterSpacing);
  for (const k of TEXT_PROPS) if (params[k] !== undefined) target[k] = params[k];
}

// A LayoutGrid with Figma's required fields filled in and the color normalized.
// { pattern: 'COLUMNS'|'ROWS'|'GRID', count?, gutterSize?, offset?, alignment?, sectionSize?, color?, visible? }
export function normalizeGrid(g) {
  const color = g.color === undefined ? { r: 1, g: 0, b: 0, a: 0.1 } : toRGBA(g.color);
  if (g.pattern === 'GRID') {
    return { pattern: 'GRID', sectionSize: g.sectionSize ?? 8, visible: g.visible ?? true, color, ...(g.boundVariables ? { boundVariables: g.boundVariables } : {}) };
  }
  const alignment = g.alignment ?? 'STRETCH';
  const out = {
    pattern: g.pattern ?? 'COLUMNS', alignment, count: g.count ?? 12, gutterSize: g.gutterSize ?? 20,
    visible: g.visible ?? true, color,
  };
  // Figma rejects offset on a centered grid and needs sectionSize on any non-stretch one.
  if (alignment !== 'CENTER') out.offset = g.offset ?? 0;
  if (alignment !== 'STRETCH') out.sectionSize = g.sectionSize ?? 60;
  if (g.boundVariables) out.boundVariables = g.boundVariables;
  return out;
}

export function describeGrid(g) {
  const o = { ...g };
  if (g.color) o.color = hexA(g.color);
  return JSON.parse(JSON.stringify(o));
}

// Message of anything thrown: Figma sometimes rejects with a plain string, not an Error —
// `e.message` would be undefined and the error would vanish from the response.
export function errorMessage(e) {
  if (e instanceof Error) return e.message;
  if (typeof e === 'string') return e;
  if (e && typeof e.message === 'string') return e.message;
  try { return JSON.stringify(e); } catch (x) { return String(e); }
}
