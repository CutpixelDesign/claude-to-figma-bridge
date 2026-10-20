// Creating new shapes and nodes.
import { requireNode, nodeInfo, resolveParent, solidPaint, loadFont } from '../lib/helpers.js';

export const createHandlers = {
  async duplicate(params) {
    const node = await requireNode(params.nodeId);
    const clone = node.clone();
    if (params.x !== undefined) clone.x = params.x;
    if (params.y !== undefined) clone.y = params.y;
    return { success: true, id: clone.id, name: clone.name };
  },

  async create_frame(params) {
    const parent = await resolveParent(params.parentId);
    const frame = figma.createFrame();
    frame.name = params.name ?? 'Frame';
    frame.resize(params.width ?? 100, params.height ?? 100);
    if (params.x !== undefined) frame.x = params.x;
    if (params.y !== undefined) frame.y = params.y;
    if (parent) parent.appendChild(frame);
    if (params.fill !== undefined) {
      frame.fills = [solidPaint(params.fill, params.fillOpacity)];
    } else {
      frame.fills = []; // transparent by default
    }
    if (params.cornerRadius !== undefined) frame.cornerRadius = params.cornerRadius;
    if (params.clipsContent !== undefined) frame.clipsContent = params.clipsContent;
    return { success: true, ...nodeInfo(frame) };
  },

  async create_rectangle(params) {
    const parent = await resolveParent(params.parentId);
    const rect = figma.createRectangle();
    rect.name = params.name ?? 'Rectangle';
    rect.resize(params.width ?? 100, params.height ?? 100);
    if (params.x !== undefined) rect.x = params.x;
    if (params.y !== undefined) rect.y = params.y;
    if (parent) parent.appendChild(rect);
    if (params.fill !== undefined) rect.fills = [solidPaint(params.fill, params.fillOpacity)];
    if (params.cornerRadius !== undefined) rect.cornerRadius = params.cornerRadius;
    if (params.stroke !== undefined) {
      rect.strokes = [solidPaint(params.stroke)];
      rect.strokeWeight = params.strokeWeight ?? 1;
    }
    return { success: true, ...nodeInfo(rect) };
  },

  async create_text(params) {
    const parent = await resolveParent(params.parentId);
    const fontName = { family: params.fontFamily ?? 'Inter', style: params.fontStyle ?? 'Regular' };
    if (params.variationSettings) fontName.variationSettings = params.variationSettings;
    await loadFont(fontName); // before createText, so a missing font leaves no orphan node
    const text = figma.createText();
    text.name = params.name ?? 'Text';
    text.fontName = fontName;
    text.characters = params.text ?? '';
    if (params.fontSize !== undefined) text.fontSize = params.fontSize;
    if (params.x !== undefined) text.x = params.x;
    if (params.y !== undefined) text.y = params.y;
    if (params.fill !== undefined) text.fills = [solidPaint(params.fill, params.fillOpacity)];
    if (params.textAlignHorizontal !== undefined) text.textAlignHorizontal = params.textAlignHorizontal;
    if (params.textWrapStyle !== undefined) text.textWrapStyle = params.textWrapStyle;
    if (parent) parent.appendChild(text);
    return { success: true, ...nodeInfo(text) };
  },

  async create_ellipse(params) {
    // params: name?, width, height, x?, y?, fill?, stroke?, strokeWeight?, parentId?
    const parent = await resolveParent(params.parentId);
    const ellipse = figma.createEllipse();
    ellipse.name = params.name ?? 'Ellipse';
    ellipse.resize(params.width ?? 100, params.height ?? 100);
    if (params.x !== undefined) ellipse.x = params.x;
    if (params.y !== undefined) ellipse.y = params.y;
    if (parent) parent.appendChild(ellipse);
    if (params.fill !== undefined) ellipse.fills = [solidPaint(params.fill, params.fillOpacity)];
    if (params.stroke !== undefined) {
      ellipse.strokes = [solidPaint(params.stroke)];
      ellipse.strokeWeight = params.strokeWeight ?? 1;
    }
    return { success: true, ...nodeInfo(ellipse) };
  },

  async create_line(params) {
    // params: name?, x?, y?, length?, rotation?, stroke?, strokeWeight?, parentId?
    const parent = await resolveParent(params.parentId);
    const line = figma.createLine();
    line.name = params.name ?? 'Line';
    if (params.x !== undefined) line.x = params.x;
    if (params.y !== undefined) line.y = params.y;
    if (params.length !== undefined) line.resize(params.length, 0);
    if (params.rotation !== undefined) line.rotation = params.rotation;
    if (parent) parent.appendChild(line);
    if (params.stroke !== undefined) {
      line.strokes = [solidPaint(params.stroke)];
      line.strokeWeight = params.strokeWeight ?? 1;
    }
    return { success: true, ...nodeInfo(line) };
  },
};

// Shared placement + paint for the vector-ish create actions below.
async function placeShape(node, params, defaultName) {
  const parent = await resolveParent(params.parentId);
  node.name = params.name ?? defaultName;
  if (params.width !== undefined || params.height !== undefined) {
    node.resize(params.width ?? node.width, params.height ?? node.height);
  }
  if (params.x !== undefined) node.x = params.x;
  if (params.y !== undefined) node.y = params.y;
  if (parent) parent.appendChild(node);
  if (params.fill !== undefined) node.fills = params.fill === null ? [] : [solidPaint(params.fill, params.fillOpacity)];
  if (params.stroke !== undefined) {
    node.strokes = [solidPaint(params.stroke)];
    node.strokeWeight = params.strokeWeight ?? 1;
  }
  return node;
}

Object.assign(createHandlers, {
  async create_svg(params) {
    // params: svg (markup string), name?, x?, y?, width?, height?, parentId?
    // Icons and illustrations: Figma parses the SVG into a frame of editable vectors.
    if (typeof params.svg !== 'string' || !params.svg.includes('<svg')) throw new Error('svg must be an SVG markup string');
    await resolveParent(params.parentId); // fail before creating anything
    const frame = figma.createNodeFromSvg(params.svg);
    if (params.width !== undefined || params.height !== undefined) {
      frame.rescale((params.width ?? frame.width * (params.height / frame.height)) / frame.width);
    }
    await placeShape(frame, { ...params, width: undefined, height: undefined }, params.name ?? 'SVG');
    return { success: true, ...nodeInfo(frame), childCount: frame.children.length };
  },

  async create_polygon(params) {
    // params: pointCount? (3), name?, width?, height?, x?, y?, fill?, stroke?, strokeWeight?, parentId?
    const node = figma.createPolygon();
    node.pointCount = params.pointCount ?? 3;
    await placeShape(node, params, 'Polygon');
    return { success: true, ...nodeInfo(node) };
  },

  async create_star(params) {
    // params: pointCount? (5), innerRadius? (0–1, 0.38), name?, width?, height?, x?, y?, fill?, stroke?, parentId?
    const node = figma.createStar();
    node.pointCount = params.pointCount ?? 5;
    if (params.innerRadius !== undefined) node.innerRadius = params.innerRadius;
    await placeShape(node, params, 'Star');
    return { success: true, ...nodeInfo(node) };
  },

  async create_vector(params) {
    // params: paths ([{ data: 'M 0 0 L 10 10 Z', windingRule?: 'NONZERO'|'EVENODD' }]) or a
    // single `data` string, name?, x?, y?, fill?, stroke?, strokeWeight?, parentId?
    const paths = params.paths ?? [{ data: params.data }];
    const node = figma.createVector();
    try {
      node.vectorPaths = paths.map(p => ({ windingRule: p.windingRule ?? 'NONZERO', data: p.data }));
    } catch (e) {
      node.remove();
      throw e;
    }
    await placeShape(node, { ...params, width: undefined, height: undefined }, 'Vector');
    return { success: true, ...nodeInfo(node) };
  },

  async get_vector(params) {
    // params: nodeId — path data of a VECTOR (or any vector-like shape)
    const node = await requireNode(params.nodeId);
    if (!('vectorPaths' in node)) throw new Error(`Node has no vector paths: ${node.type}`);
    return { id: node.id, name: node.name, type: node.type, width: node.width, height: node.height, paths: JSON.parse(JSON.stringify(node.vectorPaths)) };
  },

  async flatten(params) {
    // params: nodeIds — merges shapes into one VECTOR (like Cmd+E)
    const nodes = (await Promise.all(params.nodeIds.map(id => figma.getNodeByIdAsync(id)))).filter(Boolean);
    if (!nodes.length) throw new Error('No nodes found');
    const vector = figma.flatten(nodes);
    if (params.name) vector.name = params.name;
    return { success: true, ...nodeInfo(vector) };
  },

  async outline_stroke(params) {
    // params: nodeId — converts the stroke into a filled vector; the original stays
    const node = await requireNode(params.nodeId);
    if (!('outlineStroke' in node)) throw new Error('Node has no outlineable stroke');
    const vector = node.outlineStroke();
    if (!vector) throw new Error('Node has no visible stroke');
    return { success: true, ...nodeInfo(vector) };
  },

  async set_mask(params) {
    // params: nodeId, isMask? (true), maskType? ('ALPHA'|'VECTOR'|'LUMINANCE').
    // A mask clips the siblings above it in the same parent.
    const node = await requireNode(params.nodeId);
    if (!('isMask' in node)) throw new Error('Node cannot be a mask');
    node.isMask = params.isMask ?? true;
    if (params.maskType !== undefined) node.maskType = params.maskType;
    return { success: true, isMask: node.isMask, maskType: node.maskType };
  },
});
