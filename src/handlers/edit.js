// Mutating actions on existing nodes: geometry, fills, strokes, typography, layout.
import {
  requireNode, nodeInfo, toRGBA, solidPaint, normalizePaint, normalizeEffect, isColorInput, loadNodeFonts, applyTextProps, parseLineHeight, parseLetterSpacing, normalizeGrid, describeGrid, pageNodeOf, errorMessage, loadFont,
} from '../lib/helpers.js';

export const editHandlers = {
  async rename(params) {
    const node = await requireNode(params.nodeId);
    const oldName = node.name;
    node.name = params.name;
    return { success: true, oldName, newName: node.name };
  },

  async move(params) {
    const node = await requireNode(params.nodeId);
    if (!('x' in node)) throw new Error('Node is not positionable');
    if (params.x !== undefined) node.x = params.x;
    if (params.y !== undefined) node.y = params.y;
    return { success: true, x: node.x, y: node.y };
  },

  async move_by(params) {
    const node = await requireNode(params.nodeId);
    if (!('x' in node)) throw new Error('Node is not positionable');
    node.x += params.dx ?? 0;
    node.y += params.dy ?? 0;
    return { success: true, x: node.x, y: node.y };
  },

  async resize(params) {
    // params: nodeId, width?, height?, withConstraints? — true resizes like dragging a handle
    // in Figma: children react to their constraints (STRETCH grows, MAX moves…). Default
    // leaves the children where they are.
    const node = await requireNode(params.nodeId);
    const w = params.width ?? node.width;
    const h = params.height ?? node.height;
    if (params.withConstraints) {
      if (!('resize' in node)) throw new Error(`${node.type} cannot resize with constraints`);
      node.resize(w, h);
    } else if ('resizeWithoutConstraints' in node) {
      node.resizeWithoutConstraints(w, h);
    } else if ('resize' in node) {
      node.resize(w, h);
    } else {
      throw new Error('Node is not resizable');
    }
    return { success: true, width: node.width, height: node.height };
  },

  async set_visible(params) {
    const node = await requireNode(params.nodeId);
    node.visible = params.visible;
    return { success: true, visible: node.visible };
  },

  async set_text(params) {
    const node = await requireNode(params.nodeId);
    if (node.type !== 'TEXT') throw new Error('Node is not a text layer');
    await loadNodeFonts(node);
    const oldText = node.characters;
    node.characters = params.text;
    return { success: true, oldText, newText: node.characters };
  },

  async set_fill(params) {
    const node = await requireNode(params.nodeId);
    if (!('fills' in node)) throw new Error('Node does not support fills');
    if (params.color === null) {
      node.fills = [];
    } else {
      node.fills = [solidPaint(params.color, params.opacity)];
    }
    return { success: true };
  },

  async set_stroke(params) {
    const node = await requireNode(params.nodeId);
    if (!('strokes' in node)) throw new Error('Node does not support strokes');
    if (params.color === null) {
      node.strokes = [];
    } else {
      node.strokes = [solidPaint(params.color, params.opacity)];
      if (params.weight !== undefined) node.strokeWeight = params.weight;
      if (params.align !== undefined) node.strokeAlign = params.align;
    }
    return { success: true };
  },

  async set_corner_radius(params) {
    const node = await requireNode(params.nodeId);
    if ('cornerRadius' in node) {
      node.cornerRadius = params.radius;
    } else {
      throw new Error('Node does not support corner radius');
    }
    return { success: true };
  },

  async set_opacity(params) {
    const node = await requireNode(params.nodeId);
    node.opacity = params.opacity;
    return { success: true };
  },

  async set_effect(params) {
    // Appends one effect. Pass `effect` (a full Figma Effect object) for any type —
    // NOISE, TEXTURE, GLASS, progressive blur, SHADER… — or use the shorthand params
    // below for shadows and plain blurs.
    const node = await requireNode(params.nodeId);
    if (!('effects' in node)) throw new Error('Node does not support effects');
    if (params.effect) {
      node.effects = [...node.effects, normalizeEffect(params.effect)];
      return { success: true, effectCount: node.effects.length };
    }
    const effectType = params.effectType ?? 'DROP_SHADOW';
    const isBlur = effectType === 'LAYER_BLUR' || effectType === 'BACKGROUND_BLUR';
    const effect = isBlur
      ? { type: effectType, visible: true, radius: params.blur ?? params.radius ?? 8 }
      : { type: effectType, visible: true, blendMode: params.blendMode ?? 'NORMAL',
          // A CSS color string keeps its own alpha ('#0000001A'); an {r,g,b} object defaults to 0.15.
          color: toRGBA(params.color ?? { r: 0, g: 0, b: 0 },
            params.opacity ?? params.alpha ?? (isColorInput(params.color) ? undefined : 0.15)),
          offset: { x: params.offsetX ?? 0, y: params.offsetY ?? 4 },
          radius: params.blur ?? params.radius ?? 8, spread: params.spread ?? 0,
        };
    node.effects = [...node.effects, effect];
    return { success: true };
  },

  async set_effects(params) {
    // params: nodeId, effects — full effects array replacement ([] clears)
    const node = await requireNode(params.nodeId);
    if (!('effects' in node)) throw new Error('Node does not support effects');
    node.effects = params.effects.map(normalizeEffect);
    return { success: true, effectCount: node.effects.length };
  },

  async set_font(params) {
    // params: nodeId, family?, style?, variationSettings? (variable-font axes, e.g.
    // { wght: 450 }), size?, lineHeight? (24 px | '150%' | 'AUTO'), letterSpacing? (% number
    // | '1px'), textWrapStyle? ('AUTO'|'BALANCE'|'PRETTY'), paragraphSpacing?, paragraphIndent?,
    // textCase?, textDecoration?, leadingTrim?, listSpacing?, align? ('LEFT'|'CENTER'|'RIGHT'|
    // 'JUSTIFIED'), verticalAlign? ('TOP'|'CENTER'|'BOTTOM'), maxLines?, truncation?
    // ('DISABLED'|'ENDING'). Applies to the whole node; omitted font params keep the current font.
    const node = await requireNode(params.nodeId);
    if (node.type !== 'TEXT') throw new Error('Node is not a text layer');
    await loadNodeFonts(node);
    if (params.family !== undefined || params.style !== undefined || params.variationSettings !== undefined) {
      const cur = node.fontName === figma.mixed ? null : node.fontName;
      const font = { family: params.family ?? cur?.family ?? 'Inter' };
      // No style given: a new family starts at Regular; axes alone let Figma pick the
      // closest named instance (e.g. { wght: 900 } → Black).
      const style = params.style ?? (params.variationSettings ? undefined : params.family ? 'Regular' : cur?.style);
      if (style) font.style = style;
      if (params.variationSettings) font.variationSettings = params.variationSettings;
      await loadFont(font);
      node.fontName = font;
    }
    applyTextProps(node, params);
    if (params.align !== undefined) node.textAlignHorizontal = params.align;
    if (params.verticalAlign !== undefined) node.textAlignVertical = params.verticalAlign;
    if (params.maxLines !== undefined) node.maxLines = params.maxLines;
    if (params.truncation !== undefined) node.textTruncation = params.truncation;
    return { success: true, fontName: node.fontName === figma.mixed ? 'mixed' : node.fontName };
  },


  async set_layout(params) {
    // Auto-layout settings for any frame-like node: FRAME, COMPONENT, COMPONENT_SET, INSTANCE.
    // mode: 'HORIZONTAL' | 'VERTICAL' | 'GRID' | 'NONE'. Grid-only params: rows, columns,
    // rowGap, columnGap, rowSizes, columnSizes ([{ type: 'FIXED'|'FLEX'|'HUG', value? }]).
    const node = await requireNode(params.nodeId);
    if (!('layoutMode' in node)) throw new Error(`Node does not support auto-layout: ${node.type}`);
    if (params.mode !== undefined) node.layoutMode = params.mode;
    if (params.gap !== undefined) node.itemSpacing = params.gap;
    if (params.paddingTop !== undefined) node.paddingTop = params.paddingTop;
    if (params.paddingBottom !== undefined) node.paddingBottom = params.paddingBottom;
    if (params.paddingLeft !== undefined) node.paddingLeft = params.paddingLeft;
    if (params.paddingRight !== undefined) node.paddingRight = params.paddingRight;
    if (params.padding !== undefined) {
      node.paddingTop = node.paddingBottom = node.paddingLeft = node.paddingRight = params.padding;
    }
    if (params.align !== undefined) node.primaryAxisAlignItems = params.align;
    if (params.counterAlign !== undefined) node.counterAxisAlignItems = params.counterAlign;
    if (params.wrap !== undefined) node.layoutWrap = params.wrap ? 'WRAP' : 'NO_WRAP';
    // Wrapped rows: gap between rows, and how rows spread ('AUTO'|'SPACE_BETWEEN').
    if (params.counterGap !== undefined) node.counterAxisSpacing = params.counterGap;
    if (params.alignContent !== undefined) node.counterAxisAlignContent = params.alignContent;
    if (params.rows !== undefined) node.gridRowCount = params.rows;
    if (params.columns !== undefined) node.gridColumnCount = params.columns;
    if (params.rowGap !== undefined) node.gridRowGap = params.rowGap;
    if (params.columnGap !== undefined) node.gridColumnGap = params.columnGap;
    if (params.rowSizes !== undefined) node.gridRowSizes = params.rowSizes;
    if (params.columnSizes !== undefined) node.gridColumnSizes = params.columnSizes;
    return { success: true };
  },

  async set_grid_child(params) {
    // Place a direct child of a GRID frame. params: nodeId, row?, column? (0-based anchor
    // cell), rowSpan?, columnSpan?, horizontalAlign?, verticalAlign? ('MIN'|'CENTER'|'MAX'|'AUTO')
    const node = await requireNode(params.nodeId);
    if (node.parent?.layoutMode !== 'GRID') throw new Error('Node is not a direct child of a GRID frame');
    if (params.row !== undefined || params.column !== undefined) {
      node.setGridChildPosition(params.row ?? node.gridRowAnchorIndex, params.column ?? node.gridColumnAnchorIndex);
    }
    if (params.rowSpan !== undefined) node.gridRowSpan = params.rowSpan;
    if (params.columnSpan !== undefined) node.gridColumnSpan = params.columnSpan;
    if (params.horizontalAlign !== undefined) node.gridChildHorizontalAlign = params.horizontalAlign;
    if (params.verticalAlign !== undefined) node.gridChildVerticalAlign = params.verticalAlign;
    return {
      success: true,
      row: node.gridRowAnchorIndex, column: node.gridColumnAnchorIndex,
      rowSpan: node.gridRowSpan, columnSpan: node.gridColumnSpan,
    };
  },

  async set_strokes(params) {
    // params: nodeId, strokes — full strokes array replacement
    const node = await requireNode(params.nodeId);
    if (!('strokes' in node)) throw new Error('Node does not support strokes');
    node.strokes = params.strokes.map(normalizePaint);
    return { success: true };
  },

  async add_stroke(params) {
    // params: nodeId, stroke — appends a stroke to the existing stack
    const node = await requireNode(params.nodeId);
    if (!('strokes' in node)) throw new Error('Node does not support strokes');
    node.strokes = [...node.strokes, normalizePaint(params.stroke)];
    return { success: true, strokeCount: node.strokes.length };
  },

  async remove_stroke(params) {
    // params: nodeId, index (default: last)
    const node = await requireNode(params.nodeId);
    if (!('strokes' in node)) throw new Error('Node does not support strokes');
    const strokes = [...node.strokes];
    const idx = params.index ?? strokes.length - 1;
    strokes.splice(idx, 1);
    node.strokes = strokes;
    return { success: true, strokeCount: node.strokes.length };
  },

  async set_stroke_dash(params) {
    // params: nodeId, dashPattern — array of numbers [dash, gap, ...]; [] resets to solid
    const node = await requireNode(params.nodeId);
    if (!('dashPattern' in node)) throw new Error('Node does not support dash pattern');
    node.dashPattern = params.dashPattern;
    return { success: true, dashPattern: node.dashPattern };
  },

  async set_text_auto_resize(params) {
    // params: nodeId, mode — 'NONE'|'HEIGHT'|'WIDTH_AND_HEIGHT'|'TRUNCATE'
    const node = await requireNode(params.nodeId);
    if (node.type !== 'TEXT') throw new Error('Node is not a text layer');
    node.textAutoResize = params.mode;
    return { success: true, textAutoResize: node.textAutoResize };
  },

  async set_corner_radii(params) {
    // params: nodeId, topLeft?, topRight?, bottomRight?, bottomLeft?
    const node = await requireNode(params.nodeId);
    if (!('topLeftRadius' in node)) throw new Error('Node does not support individual corner radii');
    if (params.topLeft !== undefined) node.topLeftRadius = params.topLeft;
    if (params.topRight !== undefined) node.topRightRadius = params.topRight;
    if (params.bottomRight !== undefined) node.bottomRightRadius = params.bottomRight;
    if (params.bottomLeft !== undefined) node.bottomLeftRadius = params.bottomLeft;
    return { success: true, topLeft: node.topLeftRadius, topRight: node.topRightRadius, bottomRight: node.bottomRightRadius, bottomLeft: node.bottomLeftRadius };
  },

  async set_layout_positioning(params) {
    // params: nodeId, positioning — 'AUTO'|'ABSOLUTE'
    const node = await requireNode(params.nodeId);
    if (!('layoutPositioning' in node)) throw new Error('Node does not support layoutPositioning');
    node.layoutPositioning = params.positioning;
    return { success: true, layoutPositioning: node.layoutPositioning };
  },

  async set_min_max_size(params) {
    // params: nodeId, minWidth?, maxWidth?, minHeight?, maxHeight?
    const node = await requireNode(params.nodeId);
    if (params.minWidth !== undefined) node.minWidth = params.minWidth;
    if (params.maxWidth !== undefined) node.maxWidth = params.maxWidth;
    if (params.minHeight !== undefined) node.minHeight = params.minHeight;
    if (params.maxHeight !== undefined) node.maxHeight = params.maxHeight;
    return { success: true, minWidth: node.minWidth, maxWidth: node.maxWidth, minHeight: node.minHeight, maxHeight: node.maxHeight };
  },

  async set_fills(params) {
    // params: nodeId, fills — array of fill objects (solid/gradient)
    const node = await requireNode(params.nodeId);
    if (!('fills' in node)) throw new Error('Node does not support fills');
    node.fills = params.fills.map(normalizePaint);
    return { success: true };
  },

  async add_fill(params) {
    // params: nodeId, fill — appends a fill to the existing stack
    const node = await requireNode(params.nodeId);
    if (!('fills' in node)) throw new Error('Node does not support fills');
    if (!Array.isArray(node.fills)) throw new Error('This text has different fills per range — use set_fills or set_text_range');
    node.fills = [...node.fills, normalizePaint(params.fill)];
    return { success: true, fillCount: node.fills.length };
  },

  async remove_fill(params) {
    // params: nodeId, index (default: last)
    const node = await requireNode(params.nodeId);
    if (!('fills' in node)) throw new Error('Node does not support fills');
    if (!Array.isArray(node.fills)) throw new Error('This text has different fills per range — use set_fills or set_text_range');
    const fills = [...node.fills];
    const idx = params.index ?? fills.length - 1;
    fills.splice(idx, 1);
    node.fills = fills;
    return { success: true, fillCount: node.fills.length };
  },

  async set_image_fill(params) {
    // params: nodeId, url? | base64? | imageHash? (reuse an image already in the file),
    // scaleMode? ('FILL'|'FIT'|'CROP'|'TILE'), scalingFactor? (TILE), rotation? (90° steps)
    // → imageHash, width, height of the image
    const node = await requireNode(params.nodeId);
    if (!('fills' in node)) throw new Error('Node does not support fills');

    let image;
    if (params.base64) {
      image = figma.createImage(figma.base64Decode(params.base64));
    } else if (params.url) {
      const response = await fetch(params.url);
      if (!response.ok) throw new Error(`Image download failed: HTTP ${response.status}`);
      image = figma.createImage(new Uint8Array(await response.arrayBuffer()));
    } else if (params.imageHash) {
      image = figma.getImageByHash(params.imageHash);
      if (!image) throw new Error(`Image not found: ${params.imageHash}`);
    } else {
      throw new Error('Provide url, base64 or imageHash');
    }

    const paint = { type: 'IMAGE', imageHash: image.hash, scaleMode: params.scaleMode ?? 'FILL' };
    if (params.scalingFactor !== undefined) paint.scalingFactor = params.scalingFactor;
    if (params.rotation !== undefined) paint.rotation = params.rotation;
    node.fills = [paint];
    const size = await image.getSizeAsync();
    return { success: true, imageHash: image.hash, ...size };
  },

  async rotate(params) {
    // params: nodeId, angle (degrees, clockwise)
    const node = await requireNode(params.nodeId);
    if (!('rotation' in node)) throw new Error('Node does not support rotation');
    node.rotation = params.angle;
    return { success: true, rotation: node.rotation };
  },

  async set_constraints(params) {
    // params: nodeId, horizontal?, vertical? — 'MIN'|'MAX'|'STRETCH'|'CENTER'|'SCALE', or the
    // names Figma's panel shows: LEFT / RIGHT / LEFT_RIGHT, TOP / BOTTOM / TOP_BOTTOM.
    // Returns a `warning` when the constraints won't do anything where the node sits.
    const node = await requireNode(params.nodeId);
    if (node.type === 'GROUP' || node.type === 'BOOLEAN_OPERATION') {
      throw new Error(`A ${node.type} has no constraints of its own — set them on its children (they follow the nearest parent frame), or turn the group into a frame`);
    }
    if (!('constraints' in node)) throw new Error(`${node.type} does not support constraints`);
    const alias = { LEFT: 'MIN', TOP: 'MIN', RIGHT: 'MAX', BOTTOM: 'MAX', LEFT_RIGHT: 'STRETCH', TOP_BOTTOM: 'STRETCH' };
    const norm = (v) => (v === undefined ? undefined : alias[String(v).toUpperCase()] ?? String(v).toUpperCase());
    try {
      node.constraints = {
        horizontal: norm(params.horizontal) ?? node.constraints.horizontal,
        vertical: norm(params.vertical) ?? node.constraints.vertical,
      };
    } catch (e) {
      if (/cannot be overridden/.test(errorMessage(e))) {
        throw new Error('Constraints of a layer inside an instance cannot be overridden — change them in the main component');
      }
      throw e;
    }
    // The frame whose resizing the constraints follow — groups are transparent to them.
    let frame = node.parent;
    while (frame && frame.type === 'GROUP') frame = frame.parent;
    let warning;
    if (!frame || frame.type === 'PAGE' || frame.type === 'SECTION') {
      warning = `No effect here: constraints follow a parent frame, and this node sits directly in a ${frame ? frame.type : 'page'}`;
    } else if ('layoutMode' in frame && frame.layoutMode !== 'NONE' && node.layoutPositioning !== 'ABSOLUTE' && frame === node.parent) {
      warning = 'Ignored while the node is in auto-layout flow — set_layout_positioning ABSOLUTE first, or use set_sizing / alignment instead';
    }
    return { success: true, constraints: node.constraints, ...(warning ? { warning } : {}) };
  },

  async get_constraints(params) {
    // params: nodeId
    const node = await requireNode(params.nodeId);
    if (!('constraints' in node)) throw new Error('Node does not support constraints');
    return { nodeId: node.id, constraints: node.constraints };
  },

  async boolean_operation(params) {
    // params: nodeIds (array, min 2), operation — 'UNION'|'INTERSECT'|'SUBTRACT'|'EXCLUDE', name?
    const nodes = await Promise.all(params.nodeIds.map(id => figma.getNodeByIdAsync(id)));
    const valid = nodes.filter(Boolean);
    if (valid.length < 2) throw new Error('Need at least 2 nodes for boolean operation');
    const parent = valid[0].parent;
    let result;
    switch (params.operation) {
      case 'UNION':     result = figma.union(valid, parent); break;
      case 'INTERSECT': result = figma.intersect(valid, parent); break;
      case 'SUBTRACT':  result = figma.subtract(valid, parent); break;
      case 'EXCLUDE':   result = figma.exclude(valid, parent); break;
      default: throw new Error(`Unknown operation: ${params.operation}`);
    }
    if (params.name) result.name = params.name;
    return { success: true, ...nodeInfo(result) };
  },

  async set_sizing(params) {
    // params: nodeId, axis ('horizontal'|'vertical'|'both'), mode ('FIXED'|'HUG'|'FILL')
    const node = await requireNode(params.nodeId);
    const mode = params.mode;
    const axis = params.axis ?? 'both';

    // layoutSizingHorizontal / layoutSizingVertical cover both an auto-layout container
    // (HUG / FIXED) and a child inside auto-layout (FILL / HUG / FIXED).
    if (!('layoutSizingHorizontal' in node)) throw new Error('Node does not support layout sizing');
    if (axis === 'horizontal' || axis === 'both') node.layoutSizingHorizontal = mode;
    if (axis === 'vertical' || axis === 'both') node.layoutSizingVertical = mode;
    return { success: true, nodeId: node.id, axis, mode };
  },

  async set_blend_mode(params) {
    // params: nodeId, blendMode — e.g. 'NORMAL'|'MULTIPLY'|'SCREEN'|'OVERLAY'|...
    const node = await requireNode(params.nodeId);
    if (!('blendMode' in node)) throw new Error('Node does not support blend modes');
    node.blendMode = params.blendMode;
    return { success: true };
  },

  async set_annotation(params) {
    // params: nodeId, label (markdown), categoryId?, properties? ([{ type: 'fills' }, …]).
    // Empty/omitted label and properties clears annotations. Pass `annotations` (full
    // array) to set several at once. Native Dev Mode annotations — NOT Figma comments.
    const node = await requireNode(params.nodeId);
    if (!('annotations' in node)) throw new Error('Node does not support annotations');
    if (params.annotations) {
      node.annotations = params.annotations;
    } else if (params.label || params.properties) {
      const a = {};
      if (params.label) a.labelMarkdown = String(params.label);
      if (params.properties) a.properties = params.properties;
      if (params.categoryId) a.categoryId = params.categoryId;
      node.annotations = [a];
    } else {
      node.annotations = [];
    }
    return { success: true, annotations: node.annotations };
  },

  async set_text_range(params) {
    // Style part of a text: one word bold, a link, a list. params: nodeId, and either
    // start/end (character offsets, end exclusive; default: whole text) or match (a substring
    // — every occurrence is styled). Then any of: family?, style?, variationSettings?, size?,
    // color? + opacity?, fills?, lineHeight?, letterSpacing?, textCase?, textDecoration?,
    // hyperlink? (URL string, { type: 'NODE', value: nodeId }, or null), listType?
    // ('ORDERED'|'UNORDERED'|'NONE'), indentation?, paragraphSpacing?, paragraphIndent?,
    // textStyleId?, fillStyleId?
    const node = await requireNode(params.nodeId);
    if (node.type !== 'TEXT') throw new Error('Node is not a text layer');
    await loadNodeFonts(node);
    const ranges = [];
    if (params.match !== undefined) {
      if (!params.match) throw new Error('match must be a non-empty string');
      let i = node.characters.indexOf(params.match);
      while (i !== -1) {
        ranges.push([i, i + params.match.length]);
        i = node.characters.indexOf(params.match, i + params.match.length);
      }
      if (!ranges.length) throw new Error(`Text not found: "${params.match}"`);
    } else {
      ranges.push([params.start ?? 0, params.end ?? node.characters.length]);
    }
    for (const [a, b] of ranges) {
      if (params.family !== undefined || params.style !== undefined || params.variationSettings !== undefined) {
        const cur = node.getRangeFontName(a, a + 1);
        const font = { family: params.family ?? cur.family };
        const style = params.style ?? (params.variationSettings ? undefined : params.family ? 'Regular' : cur.style);
        if (style) font.style = style;
        if (params.variationSettings) font.variationSettings = params.variationSettings;
        await loadFont(font);
        node.setRangeFontName(a, b, font);
      }
      if (params.size !== undefined) node.setRangeFontSize(a, b, params.size);
      if (params.fills !== undefined) node.setRangeFills(a, b, params.fills.map(normalizePaint));
      else if (params.color !== undefined) node.setRangeFills(a, b, [solidPaint(params.color, params.opacity)]);
      if (params.lineHeight !== undefined) node.setRangeLineHeight(a, b, parseLineHeight(params.lineHeight));
      if (params.letterSpacing !== undefined) node.setRangeLetterSpacing(a, b, parseLetterSpacing(params.letterSpacing));
      if (params.textCase !== undefined) node.setRangeTextCase(a, b, params.textCase);
      if (params.textDecoration !== undefined) node.setRangeTextDecoration(a, b, params.textDecoration);
      if (params.hyperlink !== undefined) {
        const link = params.hyperlink === null ? null
          : typeof params.hyperlink === 'string' ? { type: 'URL', value: params.hyperlink } : params.hyperlink;
        node.setRangeHyperlink(a, b, link);
      }
      if (params.listType !== undefined) node.setRangeListOptions(a, b, { type: params.listType });
      if (params.indentation !== undefined) node.setRangeIndentation(a, b, params.indentation);
      if (params.paragraphSpacing !== undefined) node.setRangeParagraphSpacing(a, b, params.paragraphSpacing);
      if (params.paragraphIndent !== undefined) node.setRangeParagraphIndent(a, b, params.paragraphIndent);
      if (params.textStyleId !== undefined) await node.setRangeTextStyleIdAsync(a, b, params.textStyleId);
      if (params.fillStyleId !== undefined) await node.setRangeFillStyleIdAsync(a, b, params.fillStyleId);
    }
    return { success: true, ranges };
  },

  async set_layout_grids(params) {
    // params: nodeId, grids — [{ pattern: 'COLUMNS'|'ROWS'|'GRID', count?, gutterSize?, offset?,
    // alignment? ('STRETCH'|'MIN'|'MAX'|'CENTER'), sectionSize?, color?, visible? }]; [] clears.
    // Missing fields get Figma's defaults (12 columns, 20 gutter, stretch).
    const node = await requireNode(params.nodeId);
    if (!('layoutGrids' in node)) throw new Error(`Node does not support layout grids: ${node.type}`);
    node.layoutGrids = (params.grids ?? []).map(normalizeGrid);
    return { success: true, layoutGrids: node.layoutGrids.map(describeGrid) };
  },

  async set_locked(params) {
    // params: nodeId, locked (true locks the layer on the canvas)
    const node = await requireNode(params.nodeId);
    node.locked = params.locked ?? true;
    return { success: true, locked: node.locked };
  },

  async set_properties(params) {
    // Escape hatch for any writable node property without a dedicated action:
    // params: nodeId, properties { key: value } — e.g. { overflowDirection: 'VERTICAL',
    // strokeCap: 'ROUND', numberOfFixedChildren: 1, itemReverseZIndex: true }.
    // Each key is set on its own; failures are reported per key, the rest still apply.
    const node = await requireNode(params.nodeId);
    if (node.type === 'TEXT') await loadNodeFonts(node);
    const applied = [];
    const errors = {};
    for (const [k, v] of Object.entries(params.properties ?? {})) {
      try {
        if (!(k in node)) throw new Error(`no property "${k}" on ${node.type}`);
        node[k] = (k === 'fills' || k === 'strokes') && Array.isArray(v) ? v.map(normalizePaint)
          : k === 'effects' && Array.isArray(v) ? v.map(normalizeEffect)
          : k === 'layoutGrids' && Array.isArray(v) ? v.map(normalizeGrid)
          : v;
        applied.push(k);
      } catch (e) {
        errors[k] = errorMessage(e);
      }
    }
    return { success: !Object.keys(errors).length, applied, ...(Object.keys(errors).length ? { errors } : {}) };
  },

  async set_export_settings(params) {
    // params: nodeId, settings — [{ format: 'PNG'|'JPG'|'SVG'|'PDF', suffix?, constraint?
    // ({ type: 'SCALE'|'WIDTH'|'HEIGHT', value }) }]; [] clears. What "Export" shows in Figma.
    const node = await requireNode(params.nodeId);
    if (!('exportSettings' in node)) throw new Error('Node has no export settings');
    node.exportSettings = params.settings ?? [];
    return { success: true, exportSettings: node.exportSettings };
  },

  async set_reactions(params) {
    // Prototype interactions. params: nodeId, reactions — full array of Reaction objects, e.g.
    // [{ trigger: { type: 'ON_CLICK' }, actions: [{ type: 'NODE', destinationId: '1:2',
    //   navigation: 'NAVIGATE', transition: { type: 'SMART_ANIMATE', easing: { type: 'EASE_OUT' },
    //   duration: 0.3 }, preserveScrollPosition: false }] }]; [] clears. Read shapes with get_prototype.
    const node = await requireNode(params.nodeId);
    if (!('setReactionsAsync' in node)) throw new Error('Node does not support prototype reactions');
    await node.setReactionsAsync(params.reactions ?? []);
    return { success: true, reactions: JSON.parse(JSON.stringify(node.reactions)) };
  },

  async set_flow_starting_points(params) {
    // params: flows — [{ nodeId, name }], replaces the page's flows; [] clears. pageId? —
    // defaults to the page of the first flow's node (flows must sit on their own page).
    const flows = params.flows ?? [];
    let page;
    if (params.pageId) page = await requireNode(params.pageId);
    else if (flows.length) page = pageNodeOf(await requireNode(flows[0].nodeId));
    else page = figma.currentPage;
    if (!page || page.type !== 'PAGE') throw new Error('Page not found');
    page.flowStartingPoints = flows.map(f => ({ nodeId: f.nodeId, name: f.name ?? 'Flow' }));
    return { success: true, pageId: page.id, flows: page.flowStartingPoints };
  },

  async set_plugin_data(params) {
    // params: nodeId, key, value (string; '' deletes), namespace? — with a namespace the data
    // is shared (readable by other plugins), without it private to Claude Bridge.
    const node = await requireNode(params.nodeId);
    const value = typeof params.value === 'string' ? params.value : JSON.stringify(params.value);
    if (params.namespace) node.setSharedPluginData(params.namespace, params.key, value);
    else node.setPluginData(params.key, value);
    return { success: true };
  },
};
