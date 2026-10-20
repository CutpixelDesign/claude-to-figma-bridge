// Local paint, text, and effect styles.
// Style getters/setters are async — required under `documentAccess: "dynamic-page"`.
import {
  requireNode, solidPaint, normalizePaint, normalizeEffect, describePaint, applyTextProps, normalizeGrid, describeGrid, nodeInfo, pageOf, loadFont,
} from '../lib/helpers.js';

const common = (s) => ({
  id: s.id, key: s.key, name: s.name,
  ...(s.description ? { description: s.description } : {}),
  ...(s.remote ? { remote: true } : {}),
  ...(s.boundVariables && Object.keys(s.boundVariables).length ? { boundVariables: s.boundVariables } : {}),
});

export const stylesHandlers = {
  async create_text_style(params) {
    // params: name, fontFamily, fontStyle, variationSettings?, fontSize, lineHeight?
    // (24 | '150%' | 'AUTO'), letterSpacing? (% number | '1px'), paragraphSpacing?,
    // paragraphIndent?, textCase?, textDecoration?, leadingTrim?, textWrapStyle?, description?
    const fontName = { family: params.fontFamily, style: params.fontStyle };
    if (params.variationSettings) fontName.variationSettings = params.variationSettings;
    await loadFont(fontName);
    const style = figma.createTextStyle();
    style.name = params.name;
    style.fontName = fontName;
    applyTextProps(style, params);
    if (params.description !== undefined) style.description = params.description;
    return { id: style.id, name: style.name };
  },

  async get_local_styles(params = {}) {
    // Returns all local styles grouped by type, with full values: paints (solid, gradient
    // stops, images), typography incl. paragraph settings, effects, layout grids.
    // params: type? — 'paint' | 'text' | 'effect' | 'grid' to return one group only.
    const want = (t) => !params.type || params.type === t;
    const result = {};
    if (want('paint')) {
      result.paint = (await figma.getLocalPaintStylesAsync()).map(s => ({ ...common(s), paints: s.paints.map(describePaint) }));
    }
    if (want('text')) {
      result.text = (await figma.getLocalTextStylesAsync()).map(s => ({
        ...common(s),
        fontFamily: s.fontName.family, fontStyle: s.fontName.style,
        ...(s.fontName.variationSettings ? { variationSettings: s.fontName.variationSettings } : {}),
        fontSize: s.fontSize, lineHeight: s.lineHeight, letterSpacing: s.letterSpacing,
        paragraphSpacing: s.paragraphSpacing, paragraphIndent: s.paragraphIndent,
        textCase: s.textCase, textDecoration: s.textDecoration, leadingTrim: s.leadingTrim,
        textWrapStyle: s.textWrapStyle,
      }));
    }
    if (want('effect')) {
      result.effect = (await figma.getLocalEffectStylesAsync()).map(s => ({ ...common(s), effects: JSON.parse(JSON.stringify(s.effects)) }));
    }
    if (want('grid')) {
      result.grid = (await figma.getLocalGridStylesAsync()).map(s => ({ ...common(s), layoutGrids: s.layoutGrids.map(describeGrid) }));
    }
    return result;
  },

  async update_style(params) {
    // params: styleId, name?, description?, and by style type —
    //   paint:  color? + opacity?, or paints (full array)
    //   text:   fontFamily?, fontStyle?, variationSettings?, fontSize?, lineHeight?, letterSpacing?,
    //           paragraphSpacing?, paragraphIndent?, textCase?, textDecoration?, leadingTrim?, textWrapStyle?
    //   effect: effects
    //   grid:   layoutGrids
    // Every node using the style updates with it.
    const style = await figma.getStyleByIdAsync(params.styleId);
    if (!style) throw new Error(`Style not found: ${params.styleId}`);
    if (style.remote) throw new Error('Library styles are read-only — edit them in the library file');
    if (params.name !== undefined) style.name = params.name;
    if (params.description !== undefined) style.description = params.description;
    if (style.type === 'PAINT') {
      if (params.paints) style.paints = params.paints.map(normalizePaint);
      else if (params.color !== undefined) style.paints = [solidPaint(params.color, params.opacity)];
    } else if (style.type === 'TEXT') {
      await loadFont(style.fontName);
      if (params.fontFamily !== undefined || params.fontStyle !== undefined || params.variationSettings !== undefined) {
        const font = { family: params.fontFamily ?? style.fontName.family, style: params.fontStyle ?? (params.fontFamily ? 'Regular' : style.fontName.style) };
        if (params.variationSettings) font.variationSettings = params.variationSettings;
        await loadFont(font);
        style.fontName = font;
      }
      applyTextProps(style, params);
    } else if (style.type === 'EFFECT') {
      if (params.effects) style.effects = params.effects.map(normalizeEffect);
    } else if (style.type === 'GRID') {
      if (params.layoutGrids) style.layoutGrids = params.layoutGrids.map(normalizeGrid);
    }
    return { success: true, id: style.id, name: style.name, type: style.type };
  },

  async get_style_consumers(params) {
    // params: styleId, limit? (default 200) — every node using the style, and through which field
    const style = await figma.getStyleByIdAsync(params.styleId);
    if (!style) throw new Error(`Style not found: ${params.styleId}`);
    await figma.loadAllPagesAsync();
    const consumers = await style.getStyleConsumersAsync();
    const limit = params.limit ?? 200;
    return {
      styleId: style.id, name: style.name, count: consumers.length,
      consumers: consumers.slice(0, limit).map(c => ({ ...nodeInfo(c.node), fields: c.fields, page: pageOf(c.node) })),
    };
  },

  create_grid_style(params) {
    // params: name, layoutGrids ([{ pattern, count, gutterSize, offset, alignment, sectionSize, color }]), description?
    const style = figma.createGridStyle();
    style.name = params.name;
    style.layoutGrids = (params.layoutGrids ?? []).map(normalizeGrid);
    if (params.description !== undefined) style.description = params.description;
    return { id: style.id, name: style.name };
  },

  async apply_grid_style(params) {
    // params: nodeId, styleId ('' detaches)
    const node = await requireNode(params.nodeId);
    if (!('gridStyleId' in node)) throw new Error('Node does not support layout grids');
    await node.setGridStyleIdAsync(params.styleId);
    return { success: true };
  },

  async apply_text_style(params) {
    // params: nodeId, styleId
    const node = await requireNode(params.nodeId);
    if (node.type !== 'TEXT') throw new Error('Node is not a text layer');
    await node.setTextStyleIdAsync(params.styleId);
    return { success: true };
  },

  async apply_paint_style(params) {
    // params: nodeId, styleId, target ('fills'|'strokes', default 'fills')
    const node = await requireNode(params.nodeId);
    const target = params.target ?? 'fills';
    if (target === 'fills') {
      if (!('fillStyleId' in node)) throw new Error('Node does not support fill styles');
      await node.setFillStyleIdAsync(params.styleId);
    } else {
      if (!('strokeStyleId' in node)) throw new Error('Node does not support stroke styles');
      await node.setStrokeStyleIdAsync(params.styleId);
    }
    return { success: true };
  },

  async apply_effect_style(params) {
    // params: nodeId, styleId
    const node = await requireNode(params.nodeId);
    if (!('effectStyleId' in node)) throw new Error('Node does not support effect styles');
    await node.setEffectStyleIdAsync(params.styleId);
    return { success: true };
  },

  async delete_style(params) {
    // params: styleId — nodes using it keep their look but lose the style link
    const style = await figma.getStyleByIdAsync(params.styleId);
    if (!style) throw new Error(`Style not found: ${params.styleId}`);
    style.remove();
    return { success: true };
  },

  create_paint_style(params) {
    // params: name, color (any color input — see helpers), opacity? — or paints (full array), description?
    const style = figma.createPaintStyle();
    style.name = params.name;
    if (params.description !== undefined) style.description = params.description;
    style.paints = params.paints ? params.paints.map(normalizePaint) : [solidPaint(params.color, params.opacity)];
    return { id: style.id, name: style.name };
  },

  create_effect_style(params) {
    // params: name, effects (array of effect objects)
    const style = figma.createEffectStyle();
    style.name = params.name;
    if (params.description !== undefined) style.description = params.description;
    if (params.effects) style.effects = params.effects.map(normalizeEffect);
    return { id: style.id, name: style.name };
  },
};
