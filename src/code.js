figma.showUI(__html__, { width: 300, height: 160 });

function nodeInfo(n) {
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

async function buildTree(n, depth) {
  const obj = nodeInfo(n);
  if (depth > 0 && 'children' in n) {
    obj.children = [];
    for (const c of n.children) {
      obj.children.push(await buildTree(c, depth - 1));
    }
  }
  return obj;
}

async function executeAction(action, params) {
  switch (action) {

    case 'get_selection':
      return figma.currentPage.selection.map(nodeInfo);

    case 'get_node': {
      const node = await figma.getNodeByIdAsync(params.nodeId);
      if (!node) throw new Error(`Node not found: ${params.nodeId}`);
      return { ...nodeInfo(node), visible: node.visible };
    }

    case 'get_parent': {
      const node = await figma.getNodeByIdAsync(params.nodeId);
      if (!node) throw new Error(`Node not found: ${params.nodeId}`);
      const chain = [];
      let cur = node.parent;
      while (cur && cur.type !== 'PAGE' && cur.type !== 'DOCUMENT') {
        chain.push(nodeInfo(cur));
        cur = cur.parent;
      }
      return chain;
    }

    case 'get_tree': {
      const node = await figma.getNodeByIdAsync(params.nodeId);
      if (!node) throw new Error(`Node not found: ${params.nodeId}`);
      return buildTree(node, params.depth ?? 2);
    }

    case 'get_page_tree':
      return buildTree(figma.currentPage, params.depth ?? 1);

    case 'get_page_nodes':
      return figma.currentPage.children.map(n => ({
        id: n.id, name: n.name, type: n.type,
      }));

    case 'get_children': {
      const node = await figma.getNodeByIdAsync(params.nodeId);
      if (!node) throw new Error(`Node not found: ${params.nodeId}`);
      if (!('children' in node)) throw new Error('Node has no children');
      return node.children.map(nodeInfo);
    }

    case 'get_text': {
      const node = await figma.getNodeByIdAsync(params.nodeId);
      if (!node) throw new Error(`Node not found: ${params.nodeId}`);
      if (node.type !== 'TEXT') throw new Error('Node is not a text layer');
      return { text: node.characters };
    }

    case 'get_text_style': {
      const node = await figma.getNodeByIdAsync(params.nodeId);
      if (!node) throw new Error(`Node not found: ${params.nodeId}`);
      if (node.type !== 'TEXT') throw new Error('Node is not a text layer');
      const seg = node.getStyledTextSegments(['fontName', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'textDecoration', 'textCase']);
      const first = seg[0] || {};
      return {
        fontFamily: first.fontName?.family ?? null,
        fontStyle: first.fontName?.style ?? null,
        fontSize: first.fontSize ?? null,
        lineHeight: first.lineHeight ?? null,
        letterSpacing: first.letterSpacing ?? null,
        textDecoration: first.textDecoration ?? null,
        textCase: first.textCase ?? null,
        characters: node.characters,
      };
    }

    case 'create_text_style': {
      // params: name, fontFamily, fontStyle, fontSize, lineHeight (optional), letterSpacing (optional)
      await figma.loadFontAsync({ family: params.fontFamily, style: params.fontStyle });
      const style = figma.createTextStyle();
      style.name = params.name;
      style.fontName = { family: params.fontFamily, style: params.fontStyle };
      style.fontSize = params.fontSize;
      if (params.lineHeight !== undefined) style.lineHeight = params.lineHeight;
      if (params.letterSpacing !== undefined) style.letterSpacing = params.letterSpacing;
      return { id: style.id, name: style.name };
    }

    case 'rename': {
      const node = await figma.getNodeByIdAsync(params.nodeId);
      if (!node) throw new Error(`Node not found: ${params.nodeId}`);
      const oldName = node.name;
      node.name = params.name;
      return { success: true, oldName, newName: node.name };
    }

    case 'move': {
      const node = await figma.getNodeByIdAsync(params.nodeId);
      if (!node) throw new Error(`Node not found: ${params.nodeId}`);
      if (!('x' in node)) throw new Error('Node is not positionable');
      if (params.x !== undefined) node.x = params.x;
      if (params.y !== undefined) node.y = params.y;
      return { success: true, x: node.x, y: node.y };
    }

    case 'move_by': {
      const node = await figma.getNodeByIdAsync(params.nodeId);
      if (!node) throw new Error(`Node not found: ${params.nodeId}`);
      if (!('x' in node)) throw new Error('Node is not positionable');
      node.x += params.dx ?? 0;
      node.y += params.dy ?? 0;
      return { success: true, x: node.x, y: node.y };
    }

    case 'resize': {
      const node = await figma.getNodeByIdAsync(params.nodeId);
      if (!node) throw new Error(`Node not found: ${params.nodeId}`);
      const w = params.width ?? node.width;
      const h = params.height ?? node.height;
      if ('resizeWithoutConstraints' in node) {
        node.resizeWithoutConstraints(w, h);
      } else if ('resize' in node) {
        node.resize(w, h);
      } else {
        throw new Error('Node is not resizable');
      }
      return { success: true, width: node.width, height: node.height };
    }

    case 'set_visible': {
      const node = await figma.getNodeByIdAsync(params.nodeId);
      if (!node) throw new Error(`Node not found: ${params.nodeId}`);
      node.visible = params.visible;
      return { success: true, visible: node.visible };
    }

    case 'set_text': {
      const node = await figma.getNodeByIdAsync(params.nodeId);
      if (!node) throw new Error(`Node not found: ${params.nodeId}`);
      if (node.type !== 'TEXT') throw new Error('Node is not a text layer');
      const len = node.characters.length || 1;
      const fonts = new Set();
      for (let i = 0; i < len; i++) {
        const f = node.getRangeFontName(i, i + 1);
        if (f !== figma.mixed) fonts.add(JSON.stringify(f));
      }
      await Promise.all([...fonts].map(f => figma.loadFontAsync(JSON.parse(f))));
      const oldText = node.characters;
      node.characters = params.text;
      return { success: true, oldText, newText: node.characters };
    }

    case 'duplicate': {
      const node = await figma.getNodeByIdAsync(params.nodeId);
      if (!node) throw new Error(`Node not found: ${params.nodeId}`);
      const clone = node.clone();
      if (params.x !== undefined) clone.x = params.x;
      if (params.y !== undefined) clone.y = params.y;
      return { success: true, id: clone.id, name: clone.name };
    }

    case 'create_frame': {
      const frame = figma.createFrame();
      frame.name = params.name ?? 'Frame';
      frame.resize(params.width ?? 100, params.height ?? 100);
      if (params.x !== undefined) frame.x = params.x;
      if (params.y !== undefined) frame.y = params.y;
      if (params.parentId) {
        const parent = await figma.getNodeByIdAsync(params.parentId);
        if (parent && 'appendChild' in parent) parent.appendChild(frame);
      }
      if (params.fill !== undefined) frame.fills = [{ type: 'SOLID', color: params.fill, opacity: params.fillOpacity ?? 1 }];
      if (params.cornerRadius !== undefined) frame.cornerRadius = params.cornerRadius;
      if (params.clipsContent !== undefined) frame.clipsContent = params.clipsContent;
      return { success: true, ...nodeInfo(frame) };
    }

    case 'create_rectangle': {
      const rect = figma.createRectangle();
      rect.name = params.name ?? 'Rectangle';
      rect.resize(params.width ?? 100, params.height ?? 100);
      if (params.x !== undefined) rect.x = params.x;
      if (params.y !== undefined) rect.y = params.y;
      if (params.parentId) {
        const parent = await figma.getNodeByIdAsync(params.parentId);
        if (parent && 'appendChild' in parent) parent.appendChild(rect);
      }
      if (params.fill !== undefined) rect.fills = [{ type: 'SOLID', color: params.fill, opacity: params.fillOpacity ?? 1 }];
      if (params.cornerRadius !== undefined) rect.cornerRadius = params.cornerRadius;
      if (params.stroke !== undefined) {
        rect.strokes = [{ type: 'SOLID', color: params.stroke }];
        rect.strokeWeight = params.strokeWeight ?? 1;
      }
      return { success: true, ...nodeInfo(rect) };
    }

    case 'create_text': {
      const text = figma.createText();
      text.name = params.name ?? 'Text';
      await figma.loadFontAsync({ family: params.fontFamily ?? 'Inter', style: params.fontStyle ?? 'Regular' });
      text.fontName = { family: params.fontFamily ?? 'Inter', style: params.fontStyle ?? 'Regular' };
      text.characters = params.text ?? '';
      if (params.fontSize !== undefined) text.fontSize = params.fontSize;
      if (params.x !== undefined) text.x = params.x;
      if (params.y !== undefined) text.y = params.y;
      if (params.fill !== undefined) text.fills = [{ type: 'SOLID', color: params.fill }];
      if (params.textAlignHorizontal !== undefined) text.textAlignHorizontal = params.textAlignHorizontal;
      if (params.parentId) {
        const parent = await figma.getNodeByIdAsync(params.parentId);
        if (parent && 'appendChild' in parent) parent.appendChild(text);
      }
      return { success: true, ...nodeInfo(text) };
    }

    case 'set_fill': {
      const node = await figma.getNodeByIdAsync(params.nodeId);
      if (!node) throw new Error(`Node not found: ${params.nodeId}`);
      if (!('fills' in node)) throw new Error('Node does not support fills');
      if (params.color === null) {
        node.fills = [];
      } else {
        node.fills = [{ type: 'SOLID', color: params.color, opacity: params.opacity ?? 1 }];
      }
      return { success: true };
    }

    case 'set_stroke': {
      const node = await figma.getNodeByIdAsync(params.nodeId);
      if (!node) throw new Error(`Node not found: ${params.nodeId}`);
      if (!('strokes' in node)) throw new Error('Node does not support strokes');
      if (params.color === null) {
        node.strokes = [];
      } else {
        node.strokes = [{ type: 'SOLID', color: params.color }];
        if (params.weight !== undefined) node.strokeWeight = params.weight;
        if (params.align !== undefined) node.strokeAlign = params.align;
      }
      return { success: true };
    }

    case 'set_corner_radius': {
      const node = await figma.getNodeByIdAsync(params.nodeId);
      if (!node) throw new Error(`Node not found: ${params.nodeId}`);
      if ('cornerRadius' in node) {
        node.cornerRadius = params.radius;
      } else {
        throw new Error('Node does not support corner radius');
      }
      return { success: true };
    }

    case 'set_opacity': {
      const node = await figma.getNodeByIdAsync(params.nodeId);
      if (!node) throw new Error(`Node not found: ${params.nodeId}`);
      node.opacity = params.opacity;
      return { success: true };
    }

    case 'set_effect': {
      const node = await figma.getNodeByIdAsync(params.nodeId);
      if (!node) throw new Error(`Node not found: ${params.nodeId}`);
      if (!('effects' in node)) throw new Error('Node does not support effects');
      const effect = { type: params.effectType ?? 'DROP_SHADOW', visible: true,
        color: { ...( params.color ?? { r: 0, g: 0, b: 0 }), a: params.alpha ?? 0.15 },
        offset: { x: params.offsetX ?? 0, y: params.offsetY ?? 4 },
        radius: params.radius ?? 8, spread: params.spread ?? 0,
      };
      node.effects = [...node.effects, effect];
      return { success: true };
    }

    case 'set_font': {
      const node = await figma.getNodeByIdAsync(params.nodeId);
      if (!node) throw new Error(`Node not found: ${params.nodeId}`);
      if (node.type !== 'TEXT') throw new Error('Node is not a text layer');
      const family = params.family ?? 'Inter';
      const style = params.style ?? 'Regular';
      await figma.loadFontAsync({ family, style });
      node.fontName = { family, style };
      if (params.size !== undefined) node.fontSize = params.size;
      if (params.lineHeight !== undefined) node.lineHeight = { value: params.lineHeight, unit: 'PIXELS' };
      if (params.letterSpacing !== undefined) node.letterSpacing = { value: params.letterSpacing, unit: 'PERCENT' };
      return { success: true };
    }

    case 'set_layout': {
      // Auto-layout settings for a frame
      const node = await figma.getNodeByIdAsync(params.nodeId);
      if (!node) throw new Error(`Node not found: ${params.nodeId}`);
      if (node.type !== 'FRAME') throw new Error('Node is not a frame');
      if (params.mode !== undefined) node.layoutMode = params.mode; // 'HORIZONTAL' | 'VERTICAL' | 'NONE'
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
      return { success: true };
    }

    case 'reparent': {
      const node = await figma.getNodeByIdAsync(params.nodeId);
      if (!node) throw new Error(`Node not found: ${params.nodeId}`);
      const newParent = await figma.getNodeByIdAsync(params.newParentId);
      if (!newParent) throw new Error(`New parent not found: ${params.newParentId}`);
      if (!('appendChild' in newParent)) throw new Error('New parent cannot have children');
      newParent.appendChild(node);
      return { success: true, newParentId: newParent.id, x: 'x' in node ? node.x : null, y: 'y' in node ? node.y : null };
    }

    case 'batch': {
      const results = [];
      for (const sub of params.commands) {
        try {
          results.push(await executeAction(sub.action, sub));
        } catch (e) {
          results.push({ error: e.message });
        }
      }
      return results;
    }

    case 'find_all_instances': {
      // Walk scope (scopeId or current page), collect all INSTANCE nodes
      const scopeNode = params.scopeId
        ? await figma.getNodeByIdAsync(params.scopeId)
        : figma.currentPage;
      if (!scopeNode) throw new Error(`Scope node not found: ${params.scopeId}`);
      const nodes = scopeNode.findAllWithCriteria({ types: ['INSTANCE'] });
      return nodes.map(n => {
        const mc = n.mainComponent;
        return {
          id: n.id,
          name: n.name,
          mainComponentId: mc ? mc.id : null,
          mainComponentName: mc ? mc.name : null,
          x: 'x' in n ? n.x : null,
          y: 'y' in n ? n.y : null,
        };
      });
    }

    case 'get_local_components': {
      const scopeNode = params.scopeId
        ? await figma.getNodeByIdAsync(params.scopeId)
        : figma.currentPage;
      if (!scopeNode) throw new Error(`Scope node not found: ${params.scopeId}`);
      const comps = scopeNode.findAllWithCriteria({ types: ['COMPONENT', 'COMPONENT_SET'] });
      return comps.map(c => ({
        id: c.id,
        name: c.name,
        type: c.type,
        parentId: c.parent ? c.parent.id : null,
        parentName: c.parent ? c.parent.name : null,
        parentType: c.parent ? c.parent.type : null,
        childrenCount: 'children' in c ? c.children.length : 0,
      }));
    }

    case 'get_all_texts': {
      // Return all TEXT nodes under scopeId (or selection), with node name + layer name chain
      const scopeNode = params.scopeId
        ? await figma.getNodeByIdAsync(params.scopeId)
        : (figma.currentPage.selection[0] ?? figma.currentPage);
      if (!scopeNode) throw new Error('No scope node');
      const texts = scopeNode.findAllWithCriteria({ types: ['TEXT'] });
      return texts.map(n => {
        let parentName = null;
        try { parentName = n.parent ? n.parent.name : null; } catch(e) {}
        return {
          id: n.id,
          name: n.name,
          text: n.characters,
          fontSize: typeof n.fontSize === 'number' ? n.fontSize : null,
          parentName,
        };
      });
    }

    case 'audit_contrast': {
      // Walk scope, find TEXT nodes failing WCAG contrast
      function toLinear(c) { return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
      function luminance(r, g, b) { return 0.2126*toLinear(r) + 0.7152*toLinear(g) + 0.0722*toLinear(b); }
      function contrastRatio(l1, l2) {
        const hi = Math.max(l1, l2), lo = Math.min(l1, l2);
        return (hi + 0.05) / (lo + 0.05);
      }
      function getSolidFill(node) {
        if (!('fills' in node) || !node.fills || node.fills.length === 0) return null;
        for (const f of node.fills) {
          if (f.type === 'SOLID' && f.visible !== false)
            return { r: f.color.r, g: f.color.g, b: f.color.b, opacity: f.opacity ?? 1 };
        }
        return null;
      }
      function getGradientAvgColor(fills) {
        for (const f of fills) {
          if (f.type && f.type.startsWith('GRADIENT_') && f.visible !== false && f.gradientStops?.length) {
            const stops = f.gradientStops;
            const r = stops.reduce((s, x) => s + x.color.r, 0) / stops.length;
            const g = stops.reduce((s, x) => s + x.color.g, 0) / stops.length;
            const b = stops.reduce((s, x) => s + x.color.b, 0) / stops.length;
            return { r, g, b, opacity: 1, isGradient: true };
          }
        }
        return null;
      }
      function getEffectiveBg(node) {
        let n = node.parent;
        while (n && n.type !== 'PAGE') {
          if ('fills' in n && n.fills) {
            const solid = getSolidFill(n);
            if (solid && solid.opacity > 0.1) return solid;
            const grad = getGradientAvgColor(n.fills);
            if (grad) return grad;
          }
          n = n.parent;
        }
        return { r: 1, g: 1, b: 1, opacity: 1 };
      }

      const scopeNode = params.scopeId
        ? await figma.getNodeByIdAsync(params.scopeId)
        : figma.currentPage;
      if (!scopeNode) throw new Error(`Scope node not found: ${params.scopeId}`);
      const textNodes = scopeNode.findAllWithCriteria({ types: ['TEXT'] });

      const issues = [];
      for (const node of textNodes) {
          const tf = getSolidFill(node);
          if (tf) {
            const bg = getEffectiveBg(node);
            const ratio = contrastRatio(luminance(tf.r, tf.g, tf.b), luminance(bg.r, bg.g, bg.b));
            const size = typeof node.fontSize === 'number' ? node.fontSize : 12;
            const bold = typeof node.fontWeight === 'number' && node.fontWeight >= 700;
            const isLarge = size >= 18 || (size >= 14 && bold);
            const required = isLarge ? 3.0 : 4.5;
            if (ratio < required) {
              issues.push({
                id: node.id,
                name: node.name,
                text: node.characters ? node.characters.slice(0, 60) : '',
                fontSize: size,
                bold,
                ratio: Math.round(ratio * 100) / 100,
                required,
                textColor: { r: Math.round(tf.r*255), g: Math.round(tf.g*255), b: Math.round(tf.b*255) },
                bgColor:   { r: Math.round(bg.r*255), g: Math.round(bg.g*255), b: Math.round(bg.b*255) },
                bgIsGradient: bg.isGradient ?? false,
              });
            }
          }
      }
      return issues;
    }

    case 'get_screenshot': {
      const node = await figma.getNodeByIdAsync(params.nodeId);
      if (!node) throw new Error(`Node not found: ${params.nodeId}`);
      const scale = params.scale ?? 1;
      const bytes = await node.exportAsync({ format: 'PNG', constraint: { type: 'SCALE', value: scale } });
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
      let base64 = '';
      for (let i = 0; i < bytes.length; i += 3) {
        const b0 = bytes[i], b1 = bytes[i+1] ?? 0, b2 = bytes[i+2] ?? 0;
        base64 += chars[b0 >> 2] + chars[((b0 & 3) << 4) | (b1 >> 4)] +
          (i+1 < bytes.length ? chars[((b1 & 15) << 2) | (b2 >> 6)] : '=') +
          (i+2 < bytes.length ? chars[b2 & 63] : '=');
      }
      return { base64, mimeType: 'image/png', width: Math.round(node.width * scale), height: Math.round(node.height * scale) };
    }

    case 'get_fills': {
      function extractFills(n) {
        const result = { id: n.id, name: n.name, type: n.type, fills: [], gradients: [] };
        if ('fills' in n && n.fills) {
          for (const f of n.fills) {
            if (!f.visible) continue;
            if (f.type === 'SOLID') {
              result.fills.push({ r: Math.round(f.color.r * 255), g: Math.round(f.color.g * 255), b: Math.round(f.color.b * 255), opacity: f.opacity ?? 1 });
            } else if (f.type.startsWith('GRADIENT_')) {
              result.gradients.push({ type: f.type, stops: f.gradientStops.map(s => ({ r: Math.round(s.color.r*255), g: Math.round(s.color.g*255), b: Math.round(s.color.b*255), a: s.color.a, position: s.position })) });
            }
          }
        }
        return result;
      }
      const node = await figma.getNodeByIdAsync(params.nodeId);
      if (!node) throw new Error(`Node not found: ${params.nodeId}`);
      const chain = [];
      let n = node;
      let depth = 0;
      while (n && n.type !== 'PAGE' && depth < 8) {
        chain.push(extractFills(n));
        n = n.parent;
        depth++;
      }
      return chain;
    }

    case 'get_annotations': {
      const node = await figma.getNodeByIdAsync(params.nodeId ?? null) ?? figma.currentPage;
      const result = { pluginData: {}, sharedData: {} };
      try {
        const keys = node.getPluginDataKeys();
        for (const k of keys) result.pluginData[k] = node.getPluginData(k);
      } catch(e) {}
      for (const ns of ['accessibility', 'annotations', 'a11y', 'contrast', 'figma', 'com.figma.accessibility']) {
        try {
          const sharedKeys = node.getSharedPluginDataKeys(ns);
          if (sharedKeys.length) {
            result.sharedData[ns] = {};
            for (const k of sharedKeys) result.sharedData[ns][k] = node.getSharedPluginData(ns, k);
          }
        } catch(e) {}
      }
      // Also scan children for annotation-like sticky/text nodes if scopeId provided
      if (params.includeChildren && 'children' in node) {
        result.childrenData = [];
        const textNodes = node.findAllWithCriteria({ types: ['TEXT'] });
        for (const t of textNodes) {
          const keys = t.getPluginDataKeys();
          if (keys.length) {
            const data = {};
            for (const k of keys) data[k] = t.getPluginData(k);
            result.childrenData.push({ id: t.id, name: t.name, text: t.characters, pluginData: data });
          }
        }
      }
      return result;
    }

    case 'get_variables': {
      const collections = figma.variables.getLocalVariableCollections();
      return collections.map(col => ({
        id: col.id,
        name: col.name,
        modes: col.modes,
        defaultModeId: col.defaultModeId,
        variables: col.variableIds.map(vid => {
          const v = figma.variables.getVariableById(vid);
          if (!v) return null;
          return {
            id: v.id,
            name: v.name,
            type: v.resolvedType,
            values: Object.fromEntries(
              Object.entries(v.valuesByMode).map(([modeId, val]) => {
                // Resolve aliases
                if (val && typeof val === 'object' && val.type === 'VARIABLE_ALIAS') {
                  const ref = figma.variables.getVariableById(val.id);
                  return [modeId, { alias: ref ? ref.name : val.id }];
                }
                return [modeId, val];
              })
            ),
          };
        }).filter(Boolean),
      }));
    }

    case 'get_variable': {
      const v = figma.variables.getVariableById(params.variableId);
      if (!v) throw new Error(`Variable not found: ${params.variableId}`);
      const col = figma.variables.getVariableCollectionById(v.variableCollectionId);
      return {
        id: v.id,
        name: v.name,
        type: v.resolvedType,
        collection: col ? { id: col.id, name: col.name, modes: col.modes } : null,
        values: Object.fromEntries(
          Object.entries(v.valuesByMode).map(([modeId, val]) => {
            if (val && typeof val === 'object' && val.type === 'VARIABLE_ALIAS') {
              const ref = figma.variables.getVariableById(val.id);
              return [modeId, { alias: ref ? ref.name : val.id, aliasId: val.id }];
            }
            return [modeId, val];
          })
        ),
      };
    }

    case 'create_instance': {
      // params: componentId, parentId, x, y
      const comp = await figma.getNodeByIdAsync(params.componentId);
      if (!comp || comp.type !== 'COMPONENT') throw new Error(`Not a component: ${params.componentId}`);
      const instance = comp.createInstance();
      if (params.parentId) {
        const parent = await figma.getNodeByIdAsync(params.parentId);
        if (!parent) throw new Error(`Parent not found: ${params.parentId}`);
        parent.appendChild(instance);
      }
      if (params.x !== undefined) instance.x = params.x;
      if (params.y !== undefined) instance.y = params.y;
      return { id: instance.id, name: instance.name, type: instance.type, x: instance.x, y: instance.y };
    }

    case 'delete_node': {
      const node = await figma.getNodeByIdAsync(params.nodeId);
      if (!node) throw new Error(`Node not found: ${params.nodeId}`);
      node.remove();
      return { success: true };
    }

    case 'add_component_property': {
      // params: componentId, name, type ('TEXT'|'BOOLEAN'|'INSTANCE_SWAP'), defaultValue
      const node = await figma.getNodeByIdAsync(params.componentId);
      if (!node) throw new Error(`Node not found: ${params.componentId}`);
      if (node.type !== 'COMPONENT' && node.type !== 'COMPONENT_SET') throw new Error('Node is not a component');
      const key = node.addComponentProperty(params.name, params.type, params.defaultValue ?? '');
      return { key, name: params.name, type: params.type };
    }

    case 'set_property_reference': {
      // params: nodeId, references { characters: 'key', mainComponent: 'key', visible: 'key' }
      // Links a layer inside a component to a component property
      const node = await figma.getNodeByIdAsync(params.nodeId);
      if (!node) throw new Error(`Node not found: ${params.nodeId}`);
      node.componentPropertyReferences = params.references;
      return { success: true, nodeId: params.nodeId, references: params.references };
    }

    case 'get_component_properties': {
      const node = await figma.getNodeByIdAsync(params.nodeId);
      if (!node) throw new Error(`Node not found: ${params.nodeId}`);
      if (!('componentPropertyDefinitions' in node)) throw new Error('Node has no component properties');
      return node.componentPropertyDefinitions;
    }

    case 'combine_as_variants': {
      // params: componentIds (array), parentId (optional), name (optional)
      const components = [];
      for (const id of params.componentIds) {
        const node = await figma.getNodeByIdAsync(id);
        if (!node || node.type !== 'COMPONENT') throw new Error(`Not a component: ${id}`);
        components.push(node);
      }
      const parent = params.parentId ? await figma.getNodeByIdAsync(params.parentId) : components[0].parent;
      const set = figma.combineAsVariants(components, parent);
      if (params.name) set.name = params.name;
      return { id: set.id, name: set.name, type: set.type, x: set.x, y: set.y, width: set.width, height: set.height };
    }

    case 'create_component_from_node': {
      // Convert an existing frame/group node into a component in-place
      const node = await figma.getNodeByIdAsync(params.nodeId);
      if (!node) throw new Error(`Node not found: ${params.nodeId}`);
      const component = figma.createComponentFromNode(node);
      if (params.name) component.name = params.name;
      return { id: component.id, name: component.name, type: component.type };
    }

    case 'create_variable_collection': {
      // params: name, modes (optional array of mode names, default: ['Value'])
      const col = figma.variables.createVariableCollection(params.name);
      const modeNames = params.modes || ['Value'];
      // Rename the default mode
      col.renameMode(col.modes[0].modeId, modeNames[0]);
      // Add additional modes
      for (let i = 1; i < modeNames.length; i++) {
        col.addMode(modeNames[i]);
      }
      return { id: col.id, name: col.name, modes: col.modes };
    }

    case 'create_variable': {
      // params: collectionId, name, type ('COLOR'|'FLOAT'|'STRING'|'BOOLEAN'), values { modeId: value }
      // value for COLOR: { r, g, b, a } (0-1 range)
      const col = figma.variables.getVariableCollectionById(params.collectionId);
      if (!col) throw new Error(`Collection not found: ${params.collectionId}`);
      const variable = figma.variables.createVariable(params.name, col, params.type);
      if (params.values) {
        for (const [modeId, value] of Object.entries(params.values)) {
          variable.setValueForMode(modeId, value);
        }
      }
      return { id: variable.id, name: variable.name, type: variable.resolvedType };
    }

    default:
      throw new Error(`Unknown action: ${action}`);
  }
}

figma.ui.onmessage = async (msg) => {
  const { id, action, ...params } = msg;
  let result;
  try {
    result = await executeAction(action, params);
  } catch (e) {
    result = { error: e.message };
  }
  figma.ui.postMessage({ id, result });
};
