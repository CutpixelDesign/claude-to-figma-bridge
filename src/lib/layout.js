// Raw layout, sizing and look properties of a node, for audits (get_layout).
// Only fields the node actually has are returned, defaults are dropped to keep the
// payload small, and figma.mixed becomes 'mixed'.
import { hex, describeGrid } from './helpers.js';

const PADDING_FIELDS = [
  'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'strokesIncludedInLayout',
];
// Flex-only fields — a GRID frame keeps stale values here that don't affect it.
const FLEX_FIELDS = [
  'layoutWrap', 'primaryAxisSizingMode', 'counterAxisSizingMode',
  'primaryAxisAlignItems', 'counterAxisAlignItems', 'counterAxisAlignContent',
  'itemSpacing', 'counterAxisSpacing', 'itemReverseZIndex',
];
const GRID_FIELDS = [
  'gridRowCount', 'gridColumnCount', 'gridRowGap', 'gridColumnGap', 'gridRowSizes', 'gridColumnSizes',
];
const CHILD_FIELDS = [
  'layoutSizingHorizontal', 'layoutSizingVertical', 'layoutPositioning',
  'minWidth', 'maxWidth', 'minHeight', 'maxHeight', 'constraints',
  'lockAspectRatio', 'targetAspectRatio', 'rotation',
];
const GRID_CHILD_FIELDS = [
  'gridRowAnchorIndex', 'gridColumnAnchorIndex', 'gridRowSpan', 'gridColumnSpan',
  'gridChildHorizontalAlign', 'gridChildVerticalAlign',
];
const TEXT_FIELDS = [
  'textAutoResize', 'textTruncation', 'maxLines', 'textAlignHorizontal', 'textAlignVertical',
  'fontSize', 'lineHeight', 'textStyleId',
];
const LOOK_FIELDS = [
  'visible', 'locked', 'opacity', 'blendMode', 'isMask', 'maskType', 'clipsContent', 'cornerRadius',
  'cornerSmoothing', 'fillStyleId', 'effectStyleId', 'gridStyleId', 'overflowDirection',
];
const RADIUS_FIELDS = ['topLeftRadius', 'topRightRadius', 'bottomRightRadius', 'bottomLeftRadius'];
const STROKE_FIELDS = [
  'strokeWeight', 'strokeTopWeight', 'strokeRightWeight', 'strokeBottomWeight', 'strokeLeftWeight',
  'strokeAlign', 'strokeStyleId',
];

// Values that say nothing for an audit.
const DEFAULTS = {
  visible: true, opacity: 1, isMask: false, rotation: 0, itemReverseZIndex: false,
  blendMode: ['PASS_THROUGH', 'NORMAL'], lockAspectRatio: false, layoutPositioning: 'AUTO',
  counterAxisAlignContent: 'AUTO', cornerRadius: 0, locked: false, cornerSmoothing: 0,
  overflowDirection: 'NONE', gridStyleId: '', maskType: 'ALPHA',
  textTruncation: 'DISABLED', fillStyleId: '', strokeStyleId: '', effectStyleId: '', textStyleId: '',
};

function isDefault(key, value) {
  if (value === null || value === undefined) return true;
  const d = DEFAULTS[key];
  return Array.isArray(d) ? d.includes(value) : d === value;
}

function read(node, key) {
  try {
    const v = node[key];
    return v === figma.mixed ? 'mixed' : v;
  } catch (e) {
    return undefined; // property not supported on this node type
  }
}

function pick(node, keys, out) {
  for (const key of keys) {
    if (!(key in node)) continue;
    const v = read(node, key);
    if (!isDefault(key, v)) out[key] = v;
  }
}


// Variable name for a binding, marked when it isn't part of the file's own collections:
// `Name [library: Collection]` — from a library; `Name [stale: Collection]` — its collection
// is no longer in the file (deleted or left over from an older system), though the binding
// still resolves. Same-named stale and current variables can hold different values.
export function createVarNamer() {
  const cache = new Map();
  let localCollections = null;
  return async (alias) => {
    if (!alias || !alias.id) return null;
    if (!cache.has(alias.id)) {
      if (!localCollections) {
        const cols = await figma.variables.getLocalVariableCollectionsAsync();
        localCollections = new Set(cols.map(c => c.id));
      }
      const v = await figma.variables.getVariableByIdAsync(alias.id);
      let label = alias.id;
      if (v) {
        label = v.name;
        if (v.remote || !localCollections.has(v.variableCollectionId)) {
          const col = await figma.variables.getVariableCollectionByIdAsync(v.variableCollectionId);
          const colName = col ? col.name : v.variableCollectionId;
          label += v.remote ? ` [library: ${colName}]` : ` [stale: ${colName}]`;
        }
      }
      cache.set(alias.id, label);
    }
    return cache.get(alias.id);
  };
}

async function paints(list, varName) {
  if (!Array.isArray(list) || !list.length) return undefined;
  return Promise.all(list.map(async p => {
    const o = { type: p.type };
    if (p.type === 'SOLID') o.color = hex(p.color);
    if (p.type === 'IMAGE') o.scaleMode = p.scaleMode;
    if (p.opacity !== undefined && p.opacity !== 1) o.opacity = +p.opacity.toFixed(3);
    if (p.visible === false) o.visible = false;
    const v = p.boundVariables && p.boundVariables.color;
    if (v) o.variable = await varName(v);
    return o;
  }));
}

function effects(list) {
  if (!Array.isArray(list) || !list.length) return undefined;
  return list.map(e => {
    const o = { type: e.type };
    if (e.visible === false) o.visible = false;
    if ('radius' in e) o.radius = e.radius;
    if (e.color) o.color = hex(e.color) + (e.color.a !== undefined && e.color.a !== 1 ? ` a=${+e.color.a.toFixed(3)}` : '');
    if (e.offset) o.offset = e.offset;
    if ('spread' in e && e.spread) o.spread = e.spread;
    return o;
  });
}

// Variables bound to non-paint properties (padding, gap, radius, size, typography…).
async function bound(node, varName) {
  if (!('boundVariables' in node) || !node.boundVariables) return undefined;
  const out = {};
  for (const [prop, b] of Object.entries(node.boundVariables)) {
    if (!b || prop === 'fills' || prop === 'strokes' || prop === 'effects') continue;
    out[prop] = Array.isArray(b) ? await Promise.all(b.map(varName)) : await varName(b);
  }
  return Object.keys(out).length ? out : undefined;
}

async function component(node) {
  if (node.type !== 'INSTANCE') return undefined;
  const main = await node.getMainComponentAsync();
  if (!main) return { name: null, detached: true };
  const out = { name: main.parent && main.parent.type === 'COMPONENT_SET' ? main.parent.name : main.name };
  try {
    const variant = {};
    for (const [k, p] of Object.entries(node.componentProperties || {})) {
      if (p.type === 'VARIANT') variant[k] = p.value;
    }
    if (Object.keys(variant).length) out.variant = variant;
  } catch (e) { /* nested instances without readable properties */ }
  if (main.remote) out.remote = true;
  return out;
}

export async function layoutInfo(node, varName) {
  const out = {
    id: node.id, name: node.name, type: node.type,
    x: read(node, 'x'), y: read(node, 'y'), width: read(node, 'width'), height: read(node, 'height'),
  };
  if (node.parent && node.parent.type !== 'PAGE') out.parentId = node.parent.id;

  if ('layoutMode' in node) {
    out.layoutMode = node.layoutMode;
    if (node.layoutMode !== 'NONE') pick(node, PADDING_FIELDS, out);
    if (node.layoutMode === 'HORIZONTAL' || node.layoutMode === 'VERTICAL') pick(node, FLEX_FIELDS, out);
    if (node.layoutMode === 'GRID') pick(node, GRID_FIELDS, out);
  }
  pick(node, CHILD_FIELDS, out);
  if (node.parent && node.parent.layoutMode === 'GRID') pick(node, GRID_CHILD_FIELDS, out);
  if (node.type === 'TEXT') {
    pick(node, TEXT_FIELDS, out);
    out.characters = node.characters.length > 60 ? node.characters.slice(0, 60) + '…' : node.characters;
  }
  pick(node, LOOK_FIELDS, out);
  if (out.cornerRadius === 'mixed') pick(node, RADIUS_FIELDS, out);

  const fills = await paints(read(node, 'fills'), varName);
  if (fills) out.fills = fills;
  const strokes = await paints(read(node, 'strokes'), varName);
  if (strokes) {
    out.strokes = strokes;
    pick(node, STROKE_FIELDS, out);
    if (out.strokeWeight !== 'mixed') {
      for (const side of ['strokeTopWeight', 'strokeRightWeight', 'strokeBottomWeight', 'strokeLeftWeight']) delete out[side];
    }
  }
  const fx = effects(read(node, 'effects'));
  if (fx) out.effects = fx;
  const grids = read(node, 'layoutGrids');
  if (Array.isArray(grids) && grids.length) out.layoutGrids = grids.map(describeGrid);
  const modes = read(node, 'explicitVariableModes');
  if (modes && Object.keys(modes).length) out.explicitVariableModes = modes;
  const vars = await bound(node, varName);
  if (vars) out.bound = vars;
  const comp = await component(node);
  if (comp) out.component = comp;
  if ('children' in node) out.childCount = node.children.length;
  // Plugin API values (grid tracks, vectors…) can be host objects postMessage can't clone.
  return JSON.parse(JSON.stringify(out));
}

// Flat depth-first list of a subtree. intoInstances=false stops at instance boundaries.
// `types` keeps only those node types in the list (the walk still goes through everything).
export async function layoutTree(root, { maxDepth = Infinity, intoInstances = true, types = null } = {}) {
  const varName = createVarNamer();
  const nodes = [];
  const keep = Array.isArray(types) && types.length ? new Set(types) : null;
  const walk = async (n, depth) => {
    if (!keep || keep.has(n.type)) {
      const info = await layoutInfo(n, varName);
      info.depth = depth;
      nodes.push(info);
    }
    if (depth >= maxDepth || !('children' in n)) return;
    if (!intoInstances && n.type === 'INSTANCE' && n !== root) return;
    for (const c of n.children) await walk(c, depth + 1);
  };
  await walk(root, 0);
  return nodes;
}

// Keep only the requested keys of a node record (`id` always stays, so results can be
// acted on). Unknown keys are simply absent — a node only has the fields its type has.
export function pickFields(record, fields) {
  if (!Array.isArray(fields) || !fields.length) return record;
  const out = { id: record.id };
  for (const f of fields) if (f in record) out[f] = record[f];
  return out;
}

// Statistics over a flat layoutTree() list — the numbers an audit needs, in a few dozen
// lines instead of thousands of nodes: what's on styles / tokens, which raw values are used.
export function layoutSummary(nodes) {
  const count = (values, top = 15) => {
    const m = new Map();
    for (const v of values) if (v !== undefined && v !== null) m.set(v, (m.get(v) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, top).map(([value, n]) => ({ value, n }));
  };
  const share = (part, all) => ({ n: part, of: all, pct: all ? Math.round((part / all) * 100) : null });
  const texts = nodes.filter(n => n.type === 'TEXT');
  const fills = nodes.flatMap(n => (n.fills ?? []).filter(f => f.type === 'SOLID'));
  const strokes = nodes.flatMap(n => (n.strokes ?? []).filter(f => f.type === 'SOLID'));
  const al = nodes.filter(n => n.layoutMode && n.layoutMode !== 'NONE');
  const spacingBound = al.filter(n => n.bound && ['itemSpacing', 'paddingTop', 'paddingLeft', 'paddingRight', 'paddingBottom'].some(k => k in n.bound));
  const radiusNodes = nodes.filter(n => typeof n.cornerRadius === 'number' && n.cornerRadius > 0);
  const generic = /^(Frame|Group|Rectangle|Ellipse|Vector|Line|Polygon|Star|Text)( \d+)?$/;
  return {
    nodes: nodes.length,
    types: count(nodes.map(n => n.type), 20),
    topLevelFrameWidths: count(nodes.filter(n => n.depth === 1 && n.type === 'FRAME').map(n => Math.round(n.width))),
    text: {
      count: texts.length,
      onTextStyle: share(texts.filter(t => t.textStyleId && t.textStyleId !== 'mixed').length, texts.length),
      fontSizes: count(texts.map(t => (typeof t.fontSize === 'number' ? t.fontSize : t.fontSize ? 'mixed' : null))),
    },
    color: {
      solidFills: share(fills.filter(f => f.variable).length, fills.length),
      solidStrokes: share(strokes.filter(f => f.variable).length, strokes.length),
      unboundFillColors: count(fills.filter(f => !f.variable).map(f => f.color), 12),
    },
    autoLayout: {
      frames: al.length,
      framesWithoutAutoLayout: nodes.filter(n => n.layoutMode === 'NONE' && (n.childCount ?? 0) > 1).length,
      spacingOnTokens: share(spacingBound.length, al.length),
      gaps: count(al.map(n => n.itemSpacing ?? 0)),
      paddingsLeft: count(al.map(n => n.paddingLeft ?? 0)),
      paddingsTop: count(al.map(n => n.paddingTop ?? 0)),
    },
    radius: {
      values: count(radiusNodes.map(n => n.cornerRadius)),
      onTokens: share(radiusNodes.filter(n => n.bound && Object.keys(n.bound).some(k => /radius/i.test(k))).length, radiusNodes.length),
    },
    components: {
      instances: count(nodes.filter(n => n.component).map(n => n.component.name), 20),
      detachedInstances: nodes.filter(n => n.component && n.component.detached).length,
      framesNamedLikeComponents: count(nodes.filter(n => n.type === 'FRAME' && n.name.includes('/')).map(n => n.name), 10),
    },
    naming: {
      genericNames: count(nodes.filter(n => generic.test(n.name)).map(n => n.name.replace(/ \d+$/, '')), 10),
    },
    hiddenLayers: nodes.filter(n => n.visible === false).length,
    effects: nodes.filter(n => n.effects).length,
  };
}
