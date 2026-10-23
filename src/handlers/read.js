// Read-only inspection actions.
import { nodeInfo, buildTree, requireNode, resolveScope, scopeRoots, pageOf, hex, bytesResult } from '../lib/helpers.js';
import { layoutInfo, layoutTree, createVarNamer, pickFields, layoutSummary } from '../lib/layout.js';

// A page by id, loaded so its children are readable (dynamic-page access); default: current page.
async function pageParam(pageId) {
  if (!pageId) return figma.currentPage;
  const page = await requireNode(pageId);
  if (page.type !== 'PAGE') throw new Error(`Not a page: ${pageId}`);
  await page.loadAsync();
  return page;
}

export const readHandlers = {
  get_selection() {
    return figma.currentPage.selection.map(nodeInfo);
  },

  async get_node(params) {
    const node = await requireNode(params.nodeId);
    return { ...nodeInfo(node), visible: node.visible };
  },

  async get_layout(params) {
    // params: nodeId, deep?, depth?, intoInstances?, and to keep answers small:
    // fields? (only these keys per node; id always), types? (deep: only these node types),
    // summary? (deep: statistics instead of the node list)
    const node = await requireNode(params.nodeId);
    if (!params.deep) return pickFields(await layoutInfo(node, createVarNamer()), params.fields);
    const nodes = await layoutTree(node, {
      maxDepth: params.depth ?? Infinity,
      intoInstances: params.intoInstances ?? true,
      types: params.types,
    });
    if (params.summary) return { rootId: node.id, summary: layoutSummary(nodes) };
    const keep = Array.isArray(params.fields) && params.fields.length ? [...params.fields, 'depth', 'parentId'] : null;
    return { rootId: node.id, count: nodes.length, nodes: keep ? nodes.map(n => pickFields(n, keep)) : nodes };
  },

  async get_parent(params) {
    const node = await requireNode(params.nodeId);
    const chain = [];
    let cur = node.parent;
    while (cur && cur.type !== 'PAGE' && cur.type !== 'DOCUMENT') {
      chain.push(nodeInfo(cur));
      cur = cur.parent;
    }
    return chain;
  },

  async get_tree(params) {
    // params: nodeId, depth? (2), fields? — keep only these of id / name / type / x / y /
    // width / height / text per node
    const node = await requireNode(params.nodeId);
    const tree = await buildTree(node, params.depth ?? 2);
    if (!Array.isArray(params.fields) || !params.fields.length) return tree;
    const trim = (t) => ({ ...pickFields(t, params.fields), ...(t.children ? { children: t.children.map(trim) } : {}) });
    return trim(tree);
  },

  async get_page_tree(params) {
    // params: depth? (1), pageId? (default: current page)
    return buildTree(await pageParam(params.pageId), params.depth ?? 1);
  },

  async get_page_nodes(params) {
    // params: pageId? (default: current page) — reads another page without switching to it
    const page = await pageParam(params.pageId);
    return page.children.map(n => ({
      id: n.id, name: n.name, type: n.type,
    }));
  },

  async get_children(params) {
    const node = await requireNode(params.nodeId);
    if (!('children' in node)) throw new Error('Node has no children');
    return node.children.map(nodeInfo);
  },

  async get_text(params) {
    const node = await requireNode(params.nodeId);
    if (node.type !== 'TEXT') throw new Error('Node is not a text layer');
    return { text: node.characters };
  },

  async get_text_style(params) {
    // Typography per styled segment. Top-level fields describe the first segment (and
    // the whole node when `segments` has one entry); mixed text lists every run.
    const node = await requireNode(params.nodeId);
    if (node.type !== 'TEXT') throw new Error('Node is not a text layer');
    const segs = node.getStyledTextSegments([
      'fontName', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'textDecoration',
      'textCase', 'textStyleId', 'fills', 'textWrapStyle', 'boundVariables',
      'hyperlink', 'listOptions', 'indentation', 'paragraphSpacing', 'paragraphIndent',
    ]);
    const segments = segs.map(seg => ({
      start: seg.start,
      end: seg.end,
      characters: seg.characters,
      fontFamily: seg.fontName.family,
      fontStyle: seg.fontName.style,
      ...(seg.fontName.variationSettings ? { variationSettings: seg.fontName.variationSettings } : {}),
      fontSize: seg.fontSize,
      fontWeight: seg.fontWeight,
      lineHeight: seg.lineHeight,
      letterSpacing: seg.letterSpacing,
      textDecoration: seg.textDecoration,
      textCase: seg.textCase,
      textWrapStyle: seg.textWrapStyle,
      textStyleId: seg.textStyleId || null,
      fills: JSON.parse(JSON.stringify(seg.fills)),
      ...(seg.hyperlink ? { hyperlink: seg.hyperlink } : {}),
      ...(seg.listOptions && seg.listOptions.type !== 'NONE' ? { listOptions: seg.listOptions, indentation: seg.indentation } : {}),
      ...(seg.paragraphSpacing ? { paragraphSpacing: seg.paragraphSpacing } : {}),
      ...(seg.paragraphIndent ? { paragraphIndent: seg.paragraphIndent } : {}),
      ...(seg.boundVariables && Object.keys(seg.boundVariables).length ? { boundVariables: seg.boundVariables } : {}),
    }));
    const { start, end, characters, ...first } = segments[0] ?? {};
    return {
      ...first, characters: node.characters,
      textAlignHorizontal: node.textAlignHorizontal, textAlignVertical: node.textAlignVertical,
      textAutoResize: node.textAutoResize, leadingTrim: node.leadingTrim,
      mixed: segments.length > 1, segments,
    };
  },

  async get_css(params) {
    // The CSS Figma shows in Dev Mode's inspect panel: layout, sizing, colors, type.
    const node = await requireNode(params.nodeId);
    if (!('getCSSAsync' in node)) throw new Error(`Node has no CSS: ${node.type}`);
    return node.getCSSAsync();
  },

  async get_all_texts(params) {
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
  },

  // Effects as Figma stores them (shadows, blurs, noise, texture, glass…), with every
  // parameter. `deep: true` also walks the subtree and lists each node that has effects.
  async get_effects(params) {
    const node = await requireNode(params.nodeId);
    const read = (n) => ({
      id: n.id,
      name: n.name,
      type: n.type,
      effectStyleId: 'effectStyleId' in n ? n.effectStyleId || null : null,
      effects: 'effects' in n ? JSON.parse(JSON.stringify(n.effects)) : [],
    });
    if (!params.deep) return read(node);
    const out = [];
    const walk = (n) => {
      if ('effects' in n && n.effects.length) out.push(read(n));
      if ('children' in n) n.children.forEach(walk);
    };
    walk(node);
    return out;
  },

  async get_fills(params) {
    function extractFills(n) {
      const result = { id: n.id, name: n.name, type: n.type, fills: [], gradients: [], images: [] };
      if ('fills' in n && Array.isArray(n.fills)) {   // mixed text fills: see get_text_style
        for (const f of n.fills) {
          if (!f.visible) continue;
          if (f.type === 'SOLID') {
            result.fills.push({ r: Math.round(f.color.r * 255), g: Math.round(f.color.g * 255), b: Math.round(f.color.b * 255), opacity: f.opacity ?? 1 });
          } else if (f.type.startsWith('GRADIENT_')) {
            result.gradients.push({ type: f.type, stops: f.gradientStops.map(s => ({ r: Math.round(s.color.r*255), g: Math.round(s.color.g*255), b: Math.round(s.color.b*255), a: s.color.a, position: s.position })) });
          } else if (f.type === 'IMAGE') {
            result.images.push({ imageHash: f.imageHash, scaleMode: f.scaleMode });
          }
        }
      }
      return result;
    }
    const node = await requireNode(params.nodeId);
    const chain = [];
    let n = node;
    let depth = 0;
    while (n && n.type !== 'PAGE' && depth < 8) {
      chain.push(extractFills(n));
      n = n.parent;
      depth++;
    }
    return chain;
  },

  async get_annotations(params) {
    // Native Dev Mode annotations (what set_annotation writes), plus any plugin data
    // other plugins left on the node. params: nodeId? (default: current page),
    // includeChildren? — also list every descendant that carries annotations.
    const node = params.nodeId ? await requireNode(params.nodeId) : figma.currentPage;
    const read = (n) => ({ id: n.id, name: n.name, type: n.type, annotations: n.annotations });
    const result = {
      ...('annotations' in node ? read(node) : { id: node.id, name: node.name, type: node.type, annotations: [] }),
      pluginData: {},
      sharedData: {},
    };
    for (const k of node.getPluginDataKeys()) result.pluginData[k] = node.getPluginData(k);
    for (const ns of ['accessibility', 'annotations', 'a11y', 'contrast', 'figma', 'com.figma.accessibility']) {
      const keys = node.getSharedPluginDataKeys(ns);
      if (!keys.length) continue;
      result.sharedData[ns] = {};
      for (const k of keys) result.sharedData[ns][k] = node.getSharedPluginData(ns, k);
    }
    if (params.includeChildren && 'findAll' in node) {
      result.children = node.findAll(n => 'annotations' in n && n.annotations.length > 0).map(read);
    }
    return result;
  },

  async get_annotation_categories() {
    // Categories available for set_annotation's categoryId.
    const cats = await figma.annotations.getAnnotationCategoriesAsync();
    return cats.map(c => ({ id: c.id, label: c.label, color: c.color, isPreset: c.isPreset }));
  },

  async get_screenshot(params) {
    const node = await requireNode(params.nodeId);
    const scale = params.scale ?? 1;
    const bytes = await node.exportAsync({ format: 'PNG', constraint: { type: 'SCALE', value: scale } });
    const base64 = figma.base64Encode(bytes);
    return { base64, mimeType: 'image/png', width: Math.round(node.width * scale), height: Math.round(node.height * scale) };
  },

  async find_all_instances(params) {
    // Walk scope (scopeId or current page), collect all INSTANCE nodes
    // params: scopeId?, allPages?, componentId? / componentName? — only instances of that
    // component (or of any variant of that set)
    const roots = await scopeRoots(params);
    const nodes = roots.flatMap(r => r.findAllWithCriteria({ types: ['INSTANCE'] }));
    const out = await Promise.all(nodes.map(async n => {
      const mc = await n.getMainComponentAsync();
      return {
        id: n.id,
        name: n.name,
        mainComponentId: mc ? mc.id : null,
        mainComponentName: mc ? mc.name : null,
        ...(mc && mc.parent?.type === 'COMPONENT_SET' ? { componentSetId: mc.parent.id, componentSetName: mc.parent.name } : {}),
        ...(params.allPages ? { page: pageOf(n)?.name } : {}),
        x: 'x' in n ? n.x : null,
        y: 'y' in n ? n.y : null,
      };
    }));
    const { componentId: cid, componentName: cname } = params;
    if (!cid && !cname) return out;
    return out.filter(i => (cid && (i.mainComponentId === cid || i.componentSetId === cid))
      || (cname && (i.mainComponentName === cname || i.componentSetName === cname)));
  },

  async find_swapped_components(params) {
    // Instance-swap property values (an icon chosen in `Icon#…`) stay on the instance even when the
    // layer is hidden by another variant (e.g. Icon Position = No Icon), so no layer search finds them.
    // Reads componentProperties of every instance in scope (sync), groups the INSTANCE_SWAP values by
    // component and resolves each id once.
    // params: scopeId? / allPages?, names? (exact name of the component or its set), componentIds?,
    // limitPerComponent? (50) → { scanned, withSwapProps, components: [{ id, name, type, remote, count, instances }] }
    const roots = await scopeRoots(params);
    const byId = new Map();
    let scanned = 0, withSwapProps = 0;
    for (const root of roots) {
      for (const n of root.findAllWithCriteria({ types: ['INSTANCE'] })) {
        scanned++;
        let props;
        try { props = n.componentProperties; } catch (e) { continue; }
        let has = false;
        for (const [key, p] of Object.entries(props)) {
          if (p.type !== 'INSTANCE_SWAP' || typeof p.value !== 'string') continue;
          has = true;
          if (!byId.has(p.value)) byId.set(p.value, []);
          byId.get(p.value).push({ id: n.id, name: n.name, property: key.split('#')[0], ...(params.allPages ? { page: pageOf(n)?.name } : {}) });
        }
        if (has) withSwapProps++;
      }
    }
    const wantNames = params.names ? new Set(params.names) : null;
    const wantIds = params.componentIds ? new Set(params.componentIds) : null;
    const limit = params.limitPerComponent ?? 50;
    const components = [];
    for (const [id, instances] of byId) {
      if (wantIds && !wantIds.has(id)) continue;
      const comp = await figma.getNodeByIdAsync(id);
      const set = comp && comp.parent?.type === 'COMPONENT_SET' ? comp.parent : null;
      if (wantNames && !(comp && (wantNames.has(comp.name) || (set && wantNames.has(set.name))))) continue;
      components.push({
        id, name: comp ? (set ? set.name : comp.name) : null, type: comp ? comp.type : null,
        remote: comp && 'remote' in comp ? comp.remote : null,
        count: instances.length, instances: instances.slice(0, limit),
      });
    }
    components.sort((a, b) => b.count - a.count);
    return { scanned, withSwapProps, components };
  },

  async find_bound_variables(params) {
    // Every binding to a variable of another (library) file in scope, in one pass over the nodes.
    // Library variable ids look like `VariableID:<40-hex key>/…`; local ones don't carry the key.
    // Bindings on layers inside instances (ids `I…;…`) live in the library component, not in this file:
    // they come grouped by the component that holds them.
    // params: scopeId? / allPages?, limitDirect? (2000), sampleInstances? (3)
    // → { scanned, direct: [{ id, name, type, field, variable }], nested: [{ variable, owner, ownerRemote, count, sampleInstances }], variables: { id: name } }
    const REMOTE = /^VariableID:[0-9a-f]{40}\//;
    const roots = await scopeRoots(params);
    const limitDirect = params.limitDirect ?? 2000;
    const samples = params.sampleInstances ?? 3;
    const refs = (n) => {
      const out = [];
      const add = (field, bv) => {
        for (const [prop, b] of Object.entries(bv || {})) {
          for (const a of Array.isArray(b) ? b : [b]) if (a && a.id && REMOTE.test(a.id)) out.push([`${field}${prop}`, a.id]);
        }
      };
      if ('boundVariables' in n) add('', n.boundVariables);
      for (const prop of ['fills', 'strokes', 'effects']) {
        if (prop in n && Array.isArray(n[prop])) n[prop].forEach((p, i) => add(`${prop}[${i}].`, p.boundVariables));
      }
      return out;
    };
    const direct = [], nestedMap = new Map(), ownerOf = new Map(), variableIds = new Set();
    let scanned = 0, directTotal = 0;
    for (const root of roots) {
      for (const n of root.findAll()) {
        if (++scanned % 3000 === 0) await new Promise(r => setTimeout(r, 0));
        const found = refs(n);
        if (!found.length) continue;
        if (!n.id.startsWith('I')) {
          let inst = null;
          if (n.type === 'INSTANCE') {
            const main = await n.getMainComponentAsync();
            const set = main && main.parent?.type === 'COMPONENT_SET' ? main.parent : null;
            if (main) inst = { main: set ? set.name : main.name, mainKey: main.key, mainRemote: main.remote };
          }
          for (const [field, variable] of found) {
            variableIds.add(variable);
            directTotal++;
            if (direct.length < limitDirect) direct.push({ id: n.id, name: n.name, type: n.type, field, variable, ...inst, ...(params.allPages ? { page: pageOf(n)?.name } : {}) });
          }
          continue;
        }
        let outer = null;
        for (let p = n.parent; p && p.type !== 'PAGE'; p = p.parent) if (p.type === 'INSTANCE') outer = p;
        if (!outer) continue;
        if (!ownerOf.has(outer.id)) {
          const main = await outer.getMainComponentAsync();
          const set = main && main.parent?.type === 'COMPONENT_SET' ? main.parent : null;
          ownerOf.set(outer.id, main ? { name: set ? set.name : main.name, remote: main.remote, key: main.key } : { name: null, remote: null, key: null });
        }
        const owner = ownerOf.get(outer.id);
        for (const [, variable] of found) {
          variableIds.add(variable);
          const key = `${variable}|${owner.name}`;
          if (!nestedMap.has(key)) nestedMap.set(key, { variable, owner: owner.name, ownerRemote: owner.remote, ownerKey: owner.key, count: 0, instances: new Set() });
          const g = nestedMap.get(key);
          g.count++;
          if (g.instances.size < samples) g.instances.add(outer.id);
        }
      }
    }
    const variables = {};
    for (const id of variableIds) {
      try { const v = await figma.variables.getVariableByIdAsync(id); variables[id] = v ? v.name : null; } catch (e) { variables[id] = null; }
    }
    const nested = [...nestedMap.values()].map(g => ({ ...g, sampleInstances: [...g.instances], instances: undefined })).sort((a, b) => b.count - a.count);
    return { scanned, directTotal, direct, nested, variables };
  },

  async get_local_components(params) {
    // params: scopeId?, allPages?, variants? (false — hide the variants inside sets)
    const roots = await scopeRoots(params);
    const comps = roots.flatMap(r => r.findAllWithCriteria({ types: ['COMPONENT', 'COMPONENT_SET'] }))
      .filter(c => params.variants !== false || c.parent?.type !== 'COMPONENT_SET');
    return comps.map(c => ({
      id: c.id,
      key: c.key,
      name: c.name,
      type: c.type,
      ...(c.description ? { description: c.description } : {}),
      parentId: c.parent ? c.parent.id : null,
      parentName: c.parent ? c.parent.name : null,
      parentType: c.parent ? c.parent.type : null,
      ...(params.allPages ? { page: pageOf(c)?.name } : {}),
      childrenCount: 'children' in c ? c.children.length : 0,
    }));
  },

  async find_nodes(params) {
    // params (all optional, combined with AND):
    //   name (substring, case-insensitive) · nameRegex · type (one type or an array)
    //   text (exact) · textContains · fill / stroke (hex '#3366FF' — solid paints)
    //   variable (id or name bound anywhere on the node) · style (id or name of an applied style)
    //   component (instances of this main component / set — id or name)
    //   visible (true/false) · locked (true/false)
    //   scopeId · allPages (search every page) · limit (50)
    // fields? — return these get_layout keys per match instead of the basic card
    const roots = await scopeRoots(params);
    const limit = params.limit ?? 50;
    const varName = createVarNamer();
    const nameLower = params.name?.toLowerCase();
    const nameRe = params.nameRegex ? new RegExp(params.nameRegex, 'i') : null;
    const types = params.type ? (Array.isArray(params.type) ? params.type : [params.type]) : null;
    const wantHex = (h) => h && h.replace('#', '').slice(0, 6).toUpperCase();
    const fillHex = wantHex(params.fill);
    const strokeHex = wantHex(params.stroke);
    const hasSolid = (paints, h) => Array.isArray(paints) && paints.some(p => p.type === 'SOLID' && p.visible !== false && hex(p.color).slice(1) === h);

    // Resolve variable / style refs to ids once, so name or id both work.
    let varIds = null;
    if (params.variable) {
      const all = await figma.variables.getLocalVariablesAsync();
      varIds = new Set(all.filter(v => v.name === params.variable || v.id === params.variable).map(v => v.id));
      varIds.add(params.variable);
    }
    let styleIds = null;
    if (params.style) {
      const all = [
        ...(await figma.getLocalPaintStylesAsync()), ...(await figma.getLocalTextStylesAsync()),
        ...(await figma.getLocalEffectStylesAsync()), ...(await figma.getLocalGridStylesAsync()),
      ];
      styleIds = new Set(all.filter(st => st.name === params.style || st.id === params.style).map(st => st.id));
      styleIds.add(params.style);
    }
    const usesVar = (n) => {
      const ids = [];
      const add = (bv) => { for (const b of Object.values(bv || {})) for (const a of Array.isArray(b) ? b : [b]) if (a && a.id) ids.push(a.id); };
      if ('boundVariables' in n) add(n.boundVariables);
      for (const prop of ['fills', 'strokes', 'effects']) if (prop in n && Array.isArray(n[prop])) n[prop].forEach(p => add(p.boundVariables));
      return ids.some(id => varIds.has(id));
    };
    const usesStyle = (n) => ['fillStyleId', 'strokeStyleId', 'effectStyleId', 'textStyleId', 'gridStyleId']
      .some(f => f in n && typeof n[f] === 'string' && styleIds.has(n[f]));

    const results = [];
    for (const root of roots) {
      const candidates = types ? root.findAllWithCriteria({ types }) : root.findAll();
      for (const n of candidates) {
        if (results.length >= limit) break;
        if (nameLower && !n.name.toLowerCase().includes(nameLower)) continue;
        if (nameRe && !nameRe.test(n.name)) continue;
        if (params.text !== undefined && !(n.type === 'TEXT' && n.characters === params.text)) continue;
        if (params.textContains && !(n.type === 'TEXT' && n.characters.includes(params.textContains))) continue;
        if (params.visible !== undefined && n.visible !== params.visible) continue;
        if (params.locked !== undefined && n.locked !== params.locked) continue;
        if (fillHex && !('fills' in n && hasSolid(n.fills, fillHex))) continue;
        if (strokeHex && !('strokes' in n && hasSolid(n.strokes, strokeHex))) continue;
        if (varIds && !usesVar(n)) continue;
        if (styleIds && !usesStyle(n)) continue;
        if (params.component) {
          if (n.type !== 'INSTANCE') continue;
          const mc = await n.getMainComponentAsync();
          const set = mc && mc.parent?.type === 'COMPONENT_SET' ? mc.parent : null;
          const hit = mc && [mc.id, mc.name, set?.id, set?.name].includes(params.component);
          if (!hit) continue;
        }
        const info = params.fields ? pickFields(await layoutInfo(n, varName), params.fields) : nodeInfo(n);
        results.push({ ...info, ...(params.allPages ? { page: pageOf(n)?.name } : {}) });
      }
    }
    return results;
  },

  async export_node(params) {
    // params: nodeId, format? ('PNG'|'JPG'|'SVG'|'PDF', default PNG), scale? (1), or
    // width / height (fit to that size), svgOutlineText?, svgIdAttribute?, svgSimplifyStroke?,
    // contentsOnly?, useAbsoluteBounds? → base64 + mimeType. SVG also returns `svg` text.
    // Add "saveTo": "/path/file.png" to the request and the bridge server writes the file.
    const node = await requireNode(params.nodeId);
    if (!('exportAsync' in node)) throw new Error('Node cannot be exported');
    const format = (params.format ?? 'PNG').toUpperCase();
    const settings = { format };
    if (format === 'PNG' || format === 'JPG') {
      settings.constraint = params.width ? { type: 'WIDTH', value: params.width }
        : params.height ? { type: 'HEIGHT', value: params.height }
        : { type: 'SCALE', value: params.scale ?? 1 };
    }
    if (format === 'SVG') {
      for (const k of ['svgOutlineText', 'svgIdAttribute', 'svgSimplifyStroke']) if (params[k] !== undefined) settings[k] = params[k];
    }
    for (const k of ['contentsOnly', 'useAbsoluteBounds']) if (params[k] !== undefined) settings[k] = params[k];
    const bytes = await node.exportAsync(settings);
    const out = { nodeId: node.id, name: node.name, format, ...bytesResult(bytes, format) };
    if (format === 'SVG') {
      const chunks = [];
      for (let i = 0; i < bytes.length; i += 8192) chunks.push(String.fromCharCode(...bytes.subarray(i, i + 8192)));
      out.svg = chunks.join('');
    }
    return out;
  },

  async get_image(params) {
    // params: nodeId, index? — the original image behind an IMAGE fill (full resolution),
    // or imageHash directly → base64, width, height. Works with "saveTo" like export_node.
    let hash = params.imageHash;
    if (!hash) {
      const node = await requireNode(params.nodeId);
      const images = ('fills' in node && Array.isArray(node.fills) ? node.fills : []).filter(p => p.type === 'IMAGE');
      const paint = images[params.index ?? 0];
      if (!paint) throw new Error('Node has no image fill');
      hash = paint.imageHash;
    }
    const image = figma.getImageByHash(hash);
    if (!image) throw new Error(`Image not found: ${hash}`);
    const bytes = await image.getBytesAsync();
    const size = await image.getSizeAsync();
    const isJpg = bytes[0] === 0xFF && bytes[1] === 0xD8;
    const isGif = bytes[0] === 0x47 && bytes[1] === 0x49;
    return {
      imageHash: hash, ...size,
      ...bytesResult(bytes, isJpg ? 'JPG' : 'PNG'),
      ...(isGif ? { mimeType: 'image/gif' } : {}),
    };
  },

  async get_prototype(params) {
    // params: nodeId? — that node's reactions (interactions) and its subtree's with deep: true;
    // without nodeId, a page's flows and every node that has reactions (pageId? = current page).
    const read = (n) => ({ id: n.id, name: n.name, type: n.type, reactions: JSON.parse(JSON.stringify(n.reactions)) });
    const withReactions = (root) => root.findAll(n => 'reactions' in n && n.reactions.length > 0).map(read);
    if (!params.nodeId) {
      const page = params.pageId ? await requireNode(params.pageId) : figma.currentPage;
      if (page.type !== 'PAGE') throw new Error(`Not a page: ${params.pageId}`);
      await page.loadAsync();
      return {
        flows: page.flowStartingPoints,
        prototypeBackgrounds: page.prototypeBackgrounds,
        nodes: withReactions(page),
      };
    }
    const node = await requireNode(params.nodeId);
    const out = 'reactions' in node ? read(node) : { id: node.id, name: node.name, type: node.type, reactions: [] };
    for (const k of ['overflowDirection', 'numberOfFixedChildren']) if (k in node) out[k] = node[k];
    if (params.deep && 'findAll' in node) out.children = withReactions(node);
    return out;
  },

  async get_plugin_data(params) {
    // params: nodeId, key?, namespace? — private (Claude Bridge) or shared plugin data
    const node = await requireNode(params.nodeId);
    const ns = params.namespace;
    if (params.key) return { value: ns ? node.getSharedPluginData(ns, params.key) : node.getPluginData(params.key) };
    const keys = ns ? node.getSharedPluginDataKeys(ns) : node.getPluginDataKeys();
    return Object.fromEntries(keys.map(k => [k, ns ? node.getSharedPluginData(ns, k) : node.getPluginData(k)]));
  },

  async get_export_settings(params) {
    const node = await requireNode(params.nodeId);
    return { nodeId: node.id, exportSettings: 'exportSettings' in node ? node.exportSettings : [] };
  },

  get_file_info() {
    // fileKey ties the file to .figma-projects/{fileKey}/design.md
    return {
      fileKey: figma.fileKey ?? null,
      fileName: figma.root.name,
      currentPage: { id: figma.currentPage.id, name: figma.currentPage.name },
      editorType: figma.editorType,
      mode: figma.mode,
      apiVersion: figma.apiVersion,
    };
  },

  async export_svg(params) {
    const node = await requireNode(params.nodeId);
    const bytes = await node.exportAsync({ format: 'SVG' });
    const chunks = [];
    const CHUNK = 8192;
    for (let i = 0; i < bytes.length; i += CHUNK) {
      chunks.push(String.fromCharCode(...bytes.subarray(i, i + CHUNK)));
    }
    const svg = chunks.join('');
    return { svg };
  },
};
