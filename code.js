(() => {
  var __defProp = Object.defineProperty;
  var __defProps = Object.defineProperties;
  var __getOwnPropDescs = Object.getOwnPropertyDescriptors;
  var __getOwnPropSymbols = Object.getOwnPropertySymbols;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __propIsEnum = Object.prototype.propertyIsEnumerable;
  var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
  var __spreadValues = (a, b) => {
    for (var prop in b || (b = {}))
      if (__hasOwnProp.call(b, prop))
        __defNormalProp(a, prop, b[prop]);
    if (__getOwnPropSymbols)
      for (var prop of __getOwnPropSymbols(b)) {
        if (__propIsEnum.call(b, prop))
          __defNormalProp(a, prop, b[prop]);
      }
    return a;
  };
  var __spreadProps = (a, b) => __defProps(a, __getOwnPropDescs(b));
  var __objRest = (source, exclude) => {
    var target = {};
    for (var prop in source)
      if (__hasOwnProp.call(source, prop) && exclude.indexOf(prop) < 0)
        target[prop] = source[prop];
    if (source != null && __getOwnPropSymbols)
      for (var prop of __getOwnPropSymbols(source)) {
        if (exclude.indexOf(prop) < 0 && __propIsEnum.call(source, prop))
          target[prop] = source[prop];
      }
    return target;
  };

  // src/lib/helpers.js
  function nodeInfo(n) {
    return {
      id: n.id,
      name: n.name,
      type: n.type,
      x: "x" in n ? n.x : null,
      y: "y" in n ? n.y : null,
      width: "width" in n ? n.width : null,
      height: "height" in n ? n.height : null,
      text: n.type === "TEXT" ? n.characters : null
    };
  }
  async function buildTree(n, depth) {
    const obj = nodeInfo(n);
    if (depth > 0 && "children" in n) {
      obj.children = [];
      for (const c of n.children) {
        obj.children.push(await buildTree(c, depth - 1));
      }
    }
    return obj;
  }
  async function requireNode(id) {
    const node = await figma.getNodeByIdAsync(id);
    if (!node)
      throw new Error(`Node not found: ${id}`);
    return node;
  }
  async function resolveScope(scopeId) {
    if (!scopeId)
      return figma.currentPage;
    const node = await figma.getNodeByIdAsync(scopeId);
    if (!node)
      throw new Error(`Scope node not found: ${scopeId}`);
    return node;
  }
  async function resolveParent(parentId) {
    if (!parentId)
      return null;
    const parent = await figma.getNodeByIdAsync(parentId);
    if (!parent)
      throw new Error(`Parent not found: ${parentId}`);
    if (!("appendChild" in parent))
      throw new Error(`Parent cannot have children: ${parentId}`);
    return parent;
  }
  function isColorInput(c) {
    return typeof c === "string" || c !== null && typeof c === "object" && "space" in c;
  }
  function toRGBA(c, alpha) {
    var _a;
    if (isColorInput(c))
      return alpha === void 0 ? figma.util.rgba(c) : figma.util.rgba(c, alpha);
    return { r: c.r, g: c.g, b: c.b, a: (_a = alpha != null ? alpha : c.a) != null ? _a : 1 };
  }
  function solidPaint(c, opacity) {
    const paint = figma.util.solidPaint(c);
    return opacity === void 0 || opacity === null ? paint : __spreadProps(__spreadValues({}, paint), { opacity });
  }
  function normalizePaint(p) {
    if (!p || typeof p !== "object")
      return p;
    if (p.type === "SOLID" && isColorInput(p.color)) {
      const _a = p, { color } = _a, rest = __objRest(_a, ["color"]);
      return __spreadValues(__spreadValues({}, figma.util.solidPaint(color)), rest);
    }
    if (Array.isArray(p.gradientStops)) {
      return __spreadProps(__spreadValues({}, p), { gradientStops: p.gradientStops.map((s) => isColorInput(s.color) ? __spreadProps(__spreadValues({}, s), { color: figma.util.rgba(s.color) }) : s) });
    }
    return p;
  }
  function normalizeEffect(e) {
    if (!e || typeof e !== "object")
      return e;
    const out = __spreadValues({}, e);
    for (const k of ["color", "secondaryColor"])
      if (isColorInput(out[k]))
        out[k] = figma.util.rgba(out[k]);
    return out;
  }
  var loadedFonts = /* @__PURE__ */ new Map();
  function loadFont(font) {
    var _a;
    const key = JSON.stringify([font.family, font.style, (_a = font.variationSettings) != null ? _a : null]);
    if (!loadedFonts.has(key)) {
      const p = figma.loadFontAsync(font);
      loadedFonts.set(key, p);
      p.catch(() => loadedFonts.delete(key));
    }
    return loadedFonts.get(key);
  }
  async function loadSubtreeFonts(node) {
    const texts = node.type === "TEXT" ? [node] : "findAllWithCriteria" in node ? node.findAllWithCriteria({ types: ["TEXT"] }) : [];
    const fonts = /* @__PURE__ */ new Map();
    for (const t of texts) {
      const segs = t.characters.length ? t.getStyledTextSegments(["fontName"]) : [];
      if (!segs.length && t.fontName !== figma.mixed)
        fonts.set(JSON.stringify(t.fontName), t.fontName);
      for (const seg of segs)
        fonts.set(JSON.stringify(seg.fontName), seg.fontName);
    }
    const results = await Promise.allSettled([...fonts.values()].map(loadFont));
    return [...fonts.values()].filter((f, i) => results[i].status === "rejected").map((f) => `${f.family} ${f.style}`);
  }
  async function loadNodeFonts(node) {
    const fonts = /* @__PURE__ */ new Map();
    for (const seg of node.getStyledTextSegments(["fontName"])) {
      fonts.set(JSON.stringify(seg.fontName), seg.fontName);
    }
    if (fonts.size === 0 && node.fontName !== figma.mixed) {
      fonts.set(JSON.stringify(node.fontName), node.fontName);
    }
    await Promise.all([...fonts.values()].map(loadFont));
  }
  var hex = (c) => "#" + [c.r, c.g, c.b].map((x) => Math.round(x * 255).toString(16).padStart(2, "0")).join("").toUpperCase();
  var runState = { current: null };
  function hexA(c) {
    var _a;
    const a = (_a = c.a) != null ? _a : 1;
    return a === 1 ? hex(c) : hex(c) + Math.round(a * 255).toString(16).padStart(2, "0").toUpperCase();
  }
  function describePaint(p) {
    const o = { type: p.type };
    if (p.visible === false)
      o.visible = false;
    if (p.opacity !== void 0 && p.opacity !== 1)
      o.opacity = +p.opacity.toFixed(3);
    if (p.blendMode && p.blendMode !== "NORMAL")
      o.blendMode = p.blendMode;
    if (p.type === "SOLID")
      o.color = hex(p.color);
    if (p.gradientStops) {
      o.gradientStops = p.gradientStops.map((s) => ({ position: +s.position.toFixed(4), color: hexA(s.color) }));
      o.gradientTransform = p.gradientTransform;
    }
    if (p.type === "IMAGE") {
      o.imageHash = p.imageHash;
      o.scaleMode = p.scaleMode;
      if (p.scalingFactor !== void 0)
        o.scalingFactor = p.scalingFactor;
      if (p.rotation)
        o.rotation = p.rotation;
      if (p.filters)
        o.filters = p.filters;
    }
    if (p.boundVariables && Object.keys(p.boundVariables).length)
      o.boundVariables = p.boundVariables;
    return o;
  }
  async function scopeRoots(params) {
    if (params.allPages) {
      await figma.loadAllPagesAsync();
      return [...figma.root.children];
    }
    return [await resolveScope(params.scopeId)];
  }
  function pageNodeOf(node) {
    let n = node;
    while (n && n.type !== "PAGE")
      n = n.parent;
    return n;
  }
  function pageOf(node) {
    const n = pageNodeOf(node);
    return n ? { id: n.id, name: n.name } : null;
  }
  var MIME = { PNG: "image/png", JPG: "image/jpeg", SVG: "image/svg+xml", PDF: "application/pdf" };
  function bytesResult(bytes, format) {
    var _a;
    return { base64: figma.base64Encode(bytes), mimeType: (_a = MIME[format]) != null ? _a : "application/octet-stream", bytes: bytes.length };
  }
  function parseLineHeight(v) {
    if (v === "AUTO")
      return { unit: "AUTO" };
    if (typeof v === "number")
      return { value: v, unit: "PIXELS" };
    if (typeof v === "string" && v.endsWith("%"))
      return { value: parseFloat(v), unit: "PERCENT" };
    if (typeof v === "string" && v.endsWith("px"))
      return { value: parseFloat(v), unit: "PIXELS" };
    return v;
  }
  function parseLetterSpacing(v) {
    if (typeof v === "number")
      return { value: v, unit: "PERCENT" };
    if (typeof v === "string" && v.endsWith("px"))
      return { value: parseFloat(v), unit: "PIXELS" };
    if (typeof v === "string" && v.endsWith("%"))
      return { value: parseFloat(v), unit: "PERCENT" };
    return v;
  }
  var TEXT_PROPS = [
    "paragraphSpacing",
    "paragraphIndent",
    "textCase",
    "textDecoration",
    "leadingTrim",
    "listSpacing",
    "hangingPunctuation",
    "hangingList",
    "textWrapStyle"
  ];
  function applyTextProps(target, params) {
    if (params.fontSize !== void 0)
      target.fontSize = params.fontSize;
    if (params.size !== void 0)
      target.fontSize = params.size;
    if (params.lineHeight !== void 0)
      target.lineHeight = parseLineHeight(params.lineHeight);
    if (params.letterSpacing !== void 0)
      target.letterSpacing = parseLetterSpacing(params.letterSpacing);
    for (const k of TEXT_PROPS)
      if (params[k] !== void 0)
        target[k] = params[k];
  }
  function normalizeGrid(g) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _i;
    const color = g.color === void 0 ? { r: 1, g: 0, b: 0, a: 0.1 } : toRGBA(g.color);
    if (g.pattern === "GRID") {
      return __spreadValues({ pattern: "GRID", sectionSize: (_a = g.sectionSize) != null ? _a : 8, visible: (_b = g.visible) != null ? _b : true, color }, g.boundVariables ? { boundVariables: g.boundVariables } : {});
    }
    const alignment = (_c = g.alignment) != null ? _c : "STRETCH";
    const out = {
      pattern: (_d = g.pattern) != null ? _d : "COLUMNS",
      alignment,
      count: (_e = g.count) != null ? _e : 12,
      gutterSize: (_f = g.gutterSize) != null ? _f : 20,
      visible: (_g = g.visible) != null ? _g : true,
      color
    };
    if (alignment !== "CENTER")
      out.offset = (_h = g.offset) != null ? _h : 0;
    if (alignment !== "STRETCH")
      out.sectionSize = (_i = g.sectionSize) != null ? _i : 60;
    if (g.boundVariables)
      out.boundVariables = g.boundVariables;
    return out;
  }
  function describeGrid(g) {
    const o = __spreadValues({}, g);
    if (g.color)
      o.color = hexA(g.color);
    return JSON.parse(JSON.stringify(o));
  }
  function errorMessage(e) {
    if (e instanceof Error)
      return e.message;
    if (typeof e === "string")
      return e;
    if (e && typeof e.message === "string")
      return e.message;
    try {
      return JSON.stringify(e);
    } catch (x) {
      return String(e);
    }
  }

  // src/lib/layout.js
  var PADDING_FIELDS = [
    "paddingTop",
    "paddingRight",
    "paddingBottom",
    "paddingLeft",
    "strokesIncludedInLayout"
  ];
  var FLEX_FIELDS = [
    "layoutWrap",
    "primaryAxisSizingMode",
    "counterAxisSizingMode",
    "primaryAxisAlignItems",
    "counterAxisAlignItems",
    "counterAxisAlignContent",
    "itemSpacing",
    "counterAxisSpacing",
    "itemReverseZIndex"
  ];
  var GRID_FIELDS = [
    "gridRowCount",
    "gridColumnCount",
    "gridRowGap",
    "gridColumnGap",
    "gridRowSizes",
    "gridColumnSizes"
  ];
  var CHILD_FIELDS = [
    "layoutSizingHorizontal",
    "layoutSizingVertical",
    "layoutPositioning",
    "minWidth",
    "maxWidth",
    "minHeight",
    "maxHeight",
    "constraints",
    "lockAspectRatio",
    "targetAspectRatio",
    "rotation"
  ];
  var GRID_CHILD_FIELDS = [
    "gridRowAnchorIndex",
    "gridColumnAnchorIndex",
    "gridRowSpan",
    "gridColumnSpan",
    "gridChildHorizontalAlign",
    "gridChildVerticalAlign"
  ];
  var TEXT_FIELDS = [
    "textAutoResize",
    "textTruncation",
    "maxLines",
    "textAlignHorizontal",
    "textAlignVertical",
    "fontSize",
    "lineHeight",
    "textStyleId"
  ];
  var LOOK_FIELDS = [
    "visible",
    "locked",
    "opacity",
    "blendMode",
    "isMask",
    "maskType",
    "clipsContent",
    "cornerRadius",
    "cornerSmoothing",
    "fillStyleId",
    "effectStyleId",
    "gridStyleId",
    "overflowDirection"
  ];
  var RADIUS_FIELDS = ["topLeftRadius", "topRightRadius", "bottomRightRadius", "bottomLeftRadius"];
  var STROKE_FIELDS = [
    "strokeWeight",
    "strokeTopWeight",
    "strokeRightWeight",
    "strokeBottomWeight",
    "strokeLeftWeight",
    "strokeAlign",
    "strokeStyleId"
  ];
  var DEFAULTS = {
    visible: true,
    opacity: 1,
    isMask: false,
    rotation: 0,
    itemReverseZIndex: false,
    blendMode: ["PASS_THROUGH", "NORMAL"],
    lockAspectRatio: false,
    layoutPositioning: "AUTO",
    counterAxisAlignContent: "AUTO",
    cornerRadius: 0,
    locked: false,
    cornerSmoothing: 0,
    overflowDirection: "NONE",
    gridStyleId: "",
    maskType: "ALPHA",
    textTruncation: "DISABLED",
    fillStyleId: "",
    strokeStyleId: "",
    effectStyleId: "",
    textStyleId: ""
  };
  function isDefault(key, value) {
    if (value === null || value === void 0)
      return true;
    const d = DEFAULTS[key];
    return Array.isArray(d) ? d.includes(value) : d === value;
  }
  function read(node, key) {
    try {
      const v = node[key];
      return v === figma.mixed ? "mixed" : v;
    } catch (e) {
      return void 0;
    }
  }
  function pick(node, keys, out) {
    for (const key of keys) {
      if (!(key in node))
        continue;
      const v = read(node, key);
      if (!isDefault(key, v))
        out[key] = v;
    }
  }
  function createVarNamer() {
    const cache = /* @__PURE__ */ new Map();
    let localCollections = null;
    return async (alias) => {
      if (!alias || !alias.id)
        return null;
      if (!cache.has(alias.id)) {
        if (!localCollections) {
          const cols = await figma.variables.getLocalVariableCollectionsAsync();
          localCollections = new Set(cols.map((c) => c.id));
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
    if (!Array.isArray(list) || !list.length)
      return void 0;
    return Promise.all(list.map(async (p) => {
      const o = { type: p.type };
      if (p.type === "SOLID")
        o.color = hex(p.color);
      if (p.type === "IMAGE")
        o.scaleMode = p.scaleMode;
      if (p.opacity !== void 0 && p.opacity !== 1)
        o.opacity = +p.opacity.toFixed(3);
      if (p.visible === false)
        o.visible = false;
      const v = p.boundVariables && p.boundVariables.color;
      if (v)
        o.variable = await varName(v);
      return o;
    }));
  }
  function effects(list) {
    if (!Array.isArray(list) || !list.length)
      return void 0;
    return list.map((e) => {
      const o = { type: e.type };
      if (e.visible === false)
        o.visible = false;
      if ("radius" in e)
        o.radius = e.radius;
      if (e.color)
        o.color = hex(e.color) + (e.color.a !== void 0 && e.color.a !== 1 ? ` a=${+e.color.a.toFixed(3)}` : "");
      if (e.offset)
        o.offset = e.offset;
      if ("spread" in e && e.spread)
        o.spread = e.spread;
      return o;
    });
  }
  async function bound(node, varName) {
    if (!("boundVariables" in node) || !node.boundVariables)
      return void 0;
    const out = {};
    for (const [prop, b] of Object.entries(node.boundVariables)) {
      if (!b || prop === "fills" || prop === "strokes" || prop === "effects")
        continue;
      out[prop] = Array.isArray(b) ? await Promise.all(b.map(varName)) : await varName(b);
    }
    return Object.keys(out).length ? out : void 0;
  }
  async function component(node) {
    if (node.type !== "INSTANCE")
      return void 0;
    const main = await node.getMainComponentAsync();
    if (!main)
      return { name: null, detached: true };
    const out = { name: main.parent && main.parent.type === "COMPONENT_SET" ? main.parent.name : main.name };
    try {
      const variant = {};
      for (const [k, p] of Object.entries(node.componentProperties || {})) {
        if (p.type === "VARIANT")
          variant[k] = p.value;
      }
      if (Object.keys(variant).length)
        out.variant = variant;
    } catch (e) {
    }
    if (main.remote)
      out.remote = true;
    return out;
  }
  async function layoutInfo(node, varName) {
    const out = {
      id: node.id,
      name: node.name,
      type: node.type,
      x: read(node, "x"),
      y: read(node, "y"),
      width: read(node, "width"),
      height: read(node, "height")
    };
    if (node.parent && node.parent.type !== "PAGE")
      out.parentId = node.parent.id;
    if ("layoutMode" in node) {
      out.layoutMode = node.layoutMode;
      if (node.layoutMode !== "NONE")
        pick(node, PADDING_FIELDS, out);
      if (node.layoutMode === "HORIZONTAL" || node.layoutMode === "VERTICAL")
        pick(node, FLEX_FIELDS, out);
      if (node.layoutMode === "GRID")
        pick(node, GRID_FIELDS, out);
    }
    pick(node, CHILD_FIELDS, out);
    if (node.parent && node.parent.layoutMode === "GRID")
      pick(node, GRID_CHILD_FIELDS, out);
    if (node.type === "TEXT") {
      pick(node, TEXT_FIELDS, out);
      out.characters = node.characters.length > 60 ? node.characters.slice(0, 60) + "\u2026" : node.characters;
    }
    pick(node, LOOK_FIELDS, out);
    if (out.cornerRadius === "mixed")
      pick(node, RADIUS_FIELDS, out);
    const fills = await paints(read(node, "fills"), varName);
    if (fills)
      out.fills = fills;
    const strokes = await paints(read(node, "strokes"), varName);
    if (strokes) {
      out.strokes = strokes;
      pick(node, STROKE_FIELDS, out);
      if (out.strokeWeight !== "mixed") {
        for (const side of ["strokeTopWeight", "strokeRightWeight", "strokeBottomWeight", "strokeLeftWeight"])
          delete out[side];
      }
    }
    const fx = effects(read(node, "effects"));
    if (fx)
      out.effects = fx;
    const grids = read(node, "layoutGrids");
    if (Array.isArray(grids) && grids.length)
      out.layoutGrids = grids.map(describeGrid);
    const modes = read(node, "explicitVariableModes");
    if (modes && Object.keys(modes).length)
      out.explicitVariableModes = modes;
    const vars = await bound(node, varName);
    if (vars)
      out.bound = vars;
    const comp = await component(node);
    if (comp)
      out.component = comp;
    if ("children" in node)
      out.childCount = node.children.length;
    return JSON.parse(JSON.stringify(out));
  }
  async function layoutTree(root, { maxDepth = Infinity, intoInstances = true, types = null } = {}) {
    const varName = createVarNamer();
    const nodes = [];
    const keep = Array.isArray(types) && types.length ? new Set(types) : null;
    const walk = async (n, depth) => {
      if (!keep || keep.has(n.type)) {
        const info = await layoutInfo(n, varName);
        info.depth = depth;
        nodes.push(info);
      }
      if (depth >= maxDepth || !("children" in n))
        return;
      if (!intoInstances && n.type === "INSTANCE" && n !== root)
        return;
      for (const c of n.children)
        await walk(c, depth + 1);
    };
    await walk(root, 0);
    return nodes;
  }
  function pickFields(record, fields) {
    if (!Array.isArray(fields) || !fields.length)
      return record;
    const out = { id: record.id };
    for (const f of fields)
      if (f in record)
        out[f] = record[f];
    return out;
  }
  function layoutSummary(nodes) {
    const count = (values, top = 15) => {
      var _a;
      const m = /* @__PURE__ */ new Map();
      for (const v of values)
        if (v !== void 0 && v !== null)
          m.set(v, ((_a = m.get(v)) != null ? _a : 0) + 1);
      return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, top).map(([value, n]) => ({ value, n }));
    };
    const share = (part, all) => ({ n: part, of: all, pct: all ? Math.round(part / all * 100) : null });
    const texts = nodes.filter((n) => n.type === "TEXT");
    const fills = nodes.flatMap((n) => {
      var _a;
      return ((_a = n.fills) != null ? _a : []).filter((f) => f.type === "SOLID");
    });
    const strokes = nodes.flatMap((n) => {
      var _a;
      return ((_a = n.strokes) != null ? _a : []).filter((f) => f.type === "SOLID");
    });
    const al = nodes.filter((n) => n.layoutMode && n.layoutMode !== "NONE");
    const spacingBound = al.filter((n) => n.bound && ["itemSpacing", "paddingTop", "paddingLeft", "paddingRight", "paddingBottom"].some((k) => k in n.bound));
    const radiusNodes = nodes.filter((n) => typeof n.cornerRadius === "number" && n.cornerRadius > 0);
    const generic = /^(Frame|Group|Rectangle|Ellipse|Vector|Line|Polygon|Star|Text)( \d+)?$/;
    return {
      nodes: nodes.length,
      types: count(nodes.map((n) => n.type), 20),
      topLevelFrameWidths: count(nodes.filter((n) => n.depth === 1 && n.type === "FRAME").map((n) => Math.round(n.width))),
      text: {
        count: texts.length,
        onTextStyle: share(texts.filter((t) => t.textStyleId && t.textStyleId !== "mixed").length, texts.length),
        fontSizes: count(texts.map((t) => typeof t.fontSize === "number" ? t.fontSize : t.fontSize ? "mixed" : null))
      },
      color: {
        solidFills: share(fills.filter((f) => f.variable).length, fills.length),
        solidStrokes: share(strokes.filter((f) => f.variable).length, strokes.length),
        unboundFillColors: count(fills.filter((f) => !f.variable).map((f) => f.color), 12)
      },
      autoLayout: {
        frames: al.length,
        framesWithoutAutoLayout: nodes.filter((n) => {
          var _a;
          return n.layoutMode === "NONE" && ((_a = n.childCount) != null ? _a : 0) > 1;
        }).length,
        spacingOnTokens: share(spacingBound.length, al.length),
        gaps: count(al.map((n) => {
          var _a;
          return (_a = n.itemSpacing) != null ? _a : 0;
        })),
        paddingsLeft: count(al.map((n) => {
          var _a;
          return (_a = n.paddingLeft) != null ? _a : 0;
        })),
        paddingsTop: count(al.map((n) => {
          var _a;
          return (_a = n.paddingTop) != null ? _a : 0;
        }))
      },
      radius: {
        values: count(radiusNodes.map((n) => n.cornerRadius)),
        onTokens: share(radiusNodes.filter((n) => n.bound && Object.keys(n.bound).some((k) => /radius/i.test(k))).length, radiusNodes.length)
      },
      components: {
        instances: count(nodes.filter((n) => n.component).map((n) => n.component.name), 20),
        detachedInstances: nodes.filter((n) => n.component && n.component.detached).length,
        framesNamedLikeComponents: count(nodes.filter((n) => n.type === "FRAME" && n.name.includes("/")).map((n) => n.name), 10)
      },
      naming: {
        genericNames: count(nodes.filter((n) => generic.test(n.name)).map((n) => n.name.replace(/ \d+$/, "")), 10)
      },
      hiddenLayers: nodes.filter((n) => n.visible === false).length,
      effects: nodes.filter((n) => n.effects).length
    };
  }

  // src/handlers/read.js
  async function pageParam(pageId) {
    if (!pageId)
      return figma.currentPage;
    const page = await requireNode(pageId);
    if (page.type !== "PAGE")
      throw new Error(`Not a page: ${pageId}`);
    await page.loadAsync();
    return page;
  }
  var readHandlers = {
    get_selection() {
      return figma.currentPage.selection.map(nodeInfo);
    },
    async get_node(params) {
      const node = await requireNode(params.nodeId);
      return __spreadProps(__spreadValues({}, nodeInfo(node)), { visible: node.visible });
    },
    async get_layout(params) {
      var _a, _b;
      const node = await requireNode(params.nodeId);
      if (!params.deep)
        return pickFields(await layoutInfo(node, createVarNamer()), params.fields);
      const nodes = await layoutTree(node, {
        maxDepth: (_a = params.depth) != null ? _a : Infinity,
        intoInstances: (_b = params.intoInstances) != null ? _b : true,
        types: params.types
      });
      if (params.summary)
        return { rootId: node.id, summary: layoutSummary(nodes) };
      const keep = Array.isArray(params.fields) && params.fields.length ? [...params.fields, "depth", "parentId"] : null;
      return { rootId: node.id, count: nodes.length, nodes: keep ? nodes.map((n) => pickFields(n, keep)) : nodes };
    },
    async get_parent(params) {
      const node = await requireNode(params.nodeId);
      const chain = [];
      let cur = node.parent;
      while (cur && cur.type !== "PAGE" && cur.type !== "DOCUMENT") {
        chain.push(nodeInfo(cur));
        cur = cur.parent;
      }
      return chain;
    },
    async get_tree(params) {
      var _a;
      const node = await requireNode(params.nodeId);
      const tree = await buildTree(node, (_a = params.depth) != null ? _a : 2);
      if (!Array.isArray(params.fields) || !params.fields.length)
        return tree;
      const trim = (t) => __spreadValues(__spreadValues({}, pickFields(t, params.fields)), t.children ? { children: t.children.map(trim) } : {});
      return trim(tree);
    },
    async get_page_tree(params) {
      var _a;
      return buildTree(await pageParam(params.pageId), (_a = params.depth) != null ? _a : 1);
    },
    async get_page_nodes(params) {
      const page = await pageParam(params.pageId);
      return page.children.map((n) => ({
        id: n.id,
        name: n.name,
        type: n.type
      }));
    },
    async get_children(params) {
      const node = await requireNode(params.nodeId);
      if (!("children" in node))
        throw new Error("Node has no children");
      return node.children.map(nodeInfo);
    },
    async get_text(params) {
      const node = await requireNode(params.nodeId);
      if (node.type !== "TEXT")
        throw new Error("Node is not a text layer");
      return { text: node.characters };
    },
    async get_text_style(params) {
      var _a;
      const node = await requireNode(params.nodeId);
      if (node.type !== "TEXT")
        throw new Error("Node is not a text layer");
      const segs = node.getStyledTextSegments([
        "fontName",
        "fontSize",
        "fontWeight",
        "lineHeight",
        "letterSpacing",
        "textDecoration",
        "textCase",
        "textStyleId",
        "fills",
        "textWrapStyle",
        "boundVariables",
        "hyperlink",
        "listOptions",
        "indentation",
        "paragraphSpacing",
        "paragraphIndent"
      ]);
      const segments = segs.map((seg) => __spreadValues(__spreadValues(__spreadValues(__spreadValues(__spreadValues(__spreadProps(__spreadValues({
        start: seg.start,
        end: seg.end,
        characters: seg.characters,
        fontFamily: seg.fontName.family,
        fontStyle: seg.fontName.style
      }, seg.fontName.variationSettings ? { variationSettings: seg.fontName.variationSettings } : {}), {
        fontSize: seg.fontSize,
        fontWeight: seg.fontWeight,
        lineHeight: seg.lineHeight,
        letterSpacing: seg.letterSpacing,
        textDecoration: seg.textDecoration,
        textCase: seg.textCase,
        textWrapStyle: seg.textWrapStyle,
        textStyleId: seg.textStyleId || null,
        fills: JSON.parse(JSON.stringify(seg.fills))
      }), seg.hyperlink ? { hyperlink: seg.hyperlink } : {}), seg.listOptions && seg.listOptions.type !== "NONE" ? { listOptions: seg.listOptions, indentation: seg.indentation } : {}), seg.paragraphSpacing ? { paragraphSpacing: seg.paragraphSpacing } : {}), seg.paragraphIndent ? { paragraphIndent: seg.paragraphIndent } : {}), seg.boundVariables && Object.keys(seg.boundVariables).length ? { boundVariables: seg.boundVariables } : {}));
      const _b = (_a = segments[0]) != null ? _a : {}, { start, end, characters } = _b, first = __objRest(_b, ["start", "end", "characters"]);
      return __spreadProps(__spreadValues({}, first), {
        characters: node.characters,
        textAlignHorizontal: node.textAlignHorizontal,
        textAlignVertical: node.textAlignVertical,
        textAutoResize: node.textAutoResize,
        leadingTrim: node.leadingTrim,
        mixed: segments.length > 1,
        segments
      });
    },
    async get_css(params) {
      const node = await requireNode(params.nodeId);
      if (!("getCSSAsync" in node))
        throw new Error(`Node has no CSS: ${node.type}`);
      return node.getCSSAsync();
    },
    async get_all_texts(params) {
      var _a;
      const scopeNode = params.scopeId ? await figma.getNodeByIdAsync(params.scopeId) : (_a = figma.currentPage.selection[0]) != null ? _a : figma.currentPage;
      if (!scopeNode)
        throw new Error("No scope node");
      const texts = scopeNode.findAllWithCriteria({ types: ["TEXT"] });
      return texts.map((n) => {
        let parentName = null;
        try {
          parentName = n.parent ? n.parent.name : null;
        } catch (e) {
        }
        return {
          id: n.id,
          name: n.name,
          text: n.characters,
          fontSize: typeof n.fontSize === "number" ? n.fontSize : null,
          parentName
        };
      });
    },
    // Effects as Figma stores them (shadows, blurs, noise, texture, glass…), with every
    // parameter. `deep: true` also walks the subtree and lists each node that has effects.
    async get_effects(params) {
      const node = await requireNode(params.nodeId);
      const read2 = (n) => ({
        id: n.id,
        name: n.name,
        type: n.type,
        effectStyleId: "effectStyleId" in n ? n.effectStyleId || null : null,
        effects: "effects" in n ? JSON.parse(JSON.stringify(n.effects)) : []
      });
      if (!params.deep)
        return read2(node);
      const out = [];
      const walk = (n) => {
        if ("effects" in n && n.effects.length)
          out.push(read2(n));
        if ("children" in n)
          n.children.forEach(walk);
      };
      walk(node);
      return out;
    },
    async get_fills(params) {
      function extractFills(n2) {
        var _a;
        const result = { id: n2.id, name: n2.name, type: n2.type, fills: [], gradients: [], images: [] };
        if ("fills" in n2 && Array.isArray(n2.fills)) {
          for (const f of n2.fills) {
            if (!f.visible)
              continue;
            if (f.type === "SOLID") {
              result.fills.push({ r: Math.round(f.color.r * 255), g: Math.round(f.color.g * 255), b: Math.round(f.color.b * 255), opacity: (_a = f.opacity) != null ? _a : 1 });
            } else if (f.type.startsWith("GRADIENT_")) {
              result.gradients.push({ type: f.type, stops: f.gradientStops.map((s) => ({ r: Math.round(s.color.r * 255), g: Math.round(s.color.g * 255), b: Math.round(s.color.b * 255), a: s.color.a, position: s.position })) });
            } else if (f.type === "IMAGE") {
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
      while (n && n.type !== "PAGE" && depth < 8) {
        chain.push(extractFills(n));
        n = n.parent;
        depth++;
      }
      return chain;
    },
    async get_annotations(params) {
      const node = params.nodeId ? await requireNode(params.nodeId) : figma.currentPage;
      const read2 = (n) => ({ id: n.id, name: n.name, type: n.type, annotations: n.annotations });
      const result = __spreadProps(__spreadValues({}, "annotations" in node ? read2(node) : { id: node.id, name: node.name, type: node.type, annotations: [] }), {
        pluginData: {},
        sharedData: {}
      });
      for (const k of node.getPluginDataKeys())
        result.pluginData[k] = node.getPluginData(k);
      for (const ns of ["accessibility", "annotations", "a11y", "contrast", "figma", "com.figma.accessibility"]) {
        const keys = node.getSharedPluginDataKeys(ns);
        if (!keys.length)
          continue;
        result.sharedData[ns] = {};
        for (const k of keys)
          result.sharedData[ns][k] = node.getSharedPluginData(ns, k);
      }
      if (params.includeChildren && "findAll" in node) {
        result.children = node.findAll((n) => "annotations" in n && n.annotations.length > 0).map(read2);
      }
      return result;
    },
    async get_annotation_categories() {
      const cats = await figma.annotations.getAnnotationCategoriesAsync();
      return cats.map((c) => ({ id: c.id, label: c.label, color: c.color, isPreset: c.isPreset }));
    },
    async get_screenshot(params) {
      var _a;
      const node = await requireNode(params.nodeId);
      const scale = (_a = params.scale) != null ? _a : 1;
      const bytes = await node.exportAsync({ format: "PNG", constraint: { type: "SCALE", value: scale } });
      const base64 = figma.base64Encode(bytes);
      return { base64, mimeType: "image/png", width: Math.round(node.width * scale), height: Math.round(node.height * scale) };
    },
    async find_all_instances(params) {
      const roots = await scopeRoots(params);
      const nodes = roots.flatMap((r) => r.findAllWithCriteria({ types: ["INSTANCE"] }));
      const out = await Promise.all(nodes.map(async (n) => {
        var _a, _b;
        const mc = await n.getMainComponentAsync();
        return __spreadProps(__spreadValues(__spreadValues({
          id: n.id,
          name: n.name,
          mainComponentId: mc ? mc.id : null,
          mainComponentName: mc ? mc.name : null
        }, mc && ((_a = mc.parent) == null ? void 0 : _a.type) === "COMPONENT_SET" ? { componentSetId: mc.parent.id, componentSetName: mc.parent.name } : {}), params.allPages ? { page: (_b = pageOf(n)) == null ? void 0 : _b.name } : {}), {
          x: "x" in n ? n.x : null,
          y: "y" in n ? n.y : null
        });
      }));
      const { componentId: cid, componentName: cname } = params;
      if (!cid && !cname)
        return out;
      return out.filter((i) => cid && (i.mainComponentId === cid || i.componentSetId === cid) || cname && (i.mainComponentName === cname || i.componentSetName === cname));
    },
    async get_local_components(params) {
      const roots = await scopeRoots(params);
      const comps = roots.flatMap((r) => r.findAllWithCriteria({ types: ["COMPONENT", "COMPONENT_SET"] })).filter((c) => {
        var _a;
        return params.variants !== false || ((_a = c.parent) == null ? void 0 : _a.type) !== "COMPONENT_SET";
      });
      return comps.map((c) => {
        var _a;
        return __spreadProps(__spreadValues(__spreadProps(__spreadValues({
          id: c.id,
          key: c.key,
          name: c.name,
          type: c.type
        }, c.description ? { description: c.description } : {}), {
          parentId: c.parent ? c.parent.id : null,
          parentName: c.parent ? c.parent.name : null,
          parentType: c.parent ? c.parent.type : null
        }), params.allPages ? { page: (_a = pageOf(c)) == null ? void 0 : _a.name } : {}), {
          childrenCount: "children" in c ? c.children.length : 0
        });
      });
    },
    async find_nodes(params) {
      var _a, _b, _c, _d;
      const roots = await scopeRoots(params);
      const limit = (_a = params.limit) != null ? _a : 50;
      const varName = createVarNamer();
      const nameLower = (_b = params.name) == null ? void 0 : _b.toLowerCase();
      const nameRe = params.nameRegex ? new RegExp(params.nameRegex, "i") : null;
      const types = params.type ? Array.isArray(params.type) ? params.type : [params.type] : null;
      const wantHex = (h) => h && h.replace("#", "").slice(0, 6).toUpperCase();
      const fillHex = wantHex(params.fill);
      const strokeHex = wantHex(params.stroke);
      const hasSolid = (paints2, h) => Array.isArray(paints2) && paints2.some((p) => p.type === "SOLID" && p.visible !== false && hex(p.color).slice(1) === h);
      let varIds = null;
      if (params.variable) {
        const all = await figma.variables.getLocalVariablesAsync();
        varIds = new Set(all.filter((v) => v.name === params.variable || v.id === params.variable).map((v) => v.id));
        varIds.add(params.variable);
      }
      let styleIds = null;
      if (params.style) {
        const all = [
          ...await figma.getLocalPaintStylesAsync(),
          ...await figma.getLocalTextStylesAsync(),
          ...await figma.getLocalEffectStylesAsync(),
          ...await figma.getLocalGridStylesAsync()
        ];
        styleIds = new Set(all.filter((st) => st.name === params.style || st.id === params.style).map((st) => st.id));
        styleIds.add(params.style);
      }
      const usesVar = (n) => {
        const ids = [];
        const add = (bv) => {
          for (const b of Object.values(bv || {}))
            for (const a of Array.isArray(b) ? b : [b])
              if (a && a.id)
                ids.push(a.id);
        };
        if ("boundVariables" in n)
          add(n.boundVariables);
        for (const prop of ["fills", "strokes", "effects"])
          if (prop in n && Array.isArray(n[prop]))
            n[prop].forEach((p) => add(p.boundVariables));
        return ids.some((id) => varIds.has(id));
      };
      const usesStyle = (n) => ["fillStyleId", "strokeStyleId", "effectStyleId", "textStyleId", "gridStyleId"].some((f) => f in n && typeof n[f] === "string" && styleIds.has(n[f]));
      const results = [];
      for (const root of roots) {
        const candidates = types ? root.findAllWithCriteria({ types }) : root.findAll();
        for (const n of candidates) {
          if (results.length >= limit)
            break;
          if (nameLower && !n.name.toLowerCase().includes(nameLower))
            continue;
          if (nameRe && !nameRe.test(n.name))
            continue;
          if (params.text !== void 0 && !(n.type === "TEXT" && n.characters === params.text))
            continue;
          if (params.textContains && !(n.type === "TEXT" && n.characters.includes(params.textContains)))
            continue;
          if (params.visible !== void 0 && n.visible !== params.visible)
            continue;
          if (params.locked !== void 0 && n.locked !== params.locked)
            continue;
          if (fillHex && !("fills" in n && hasSolid(n.fills, fillHex)))
            continue;
          if (strokeHex && !("strokes" in n && hasSolid(n.strokes, strokeHex)))
            continue;
          if (varIds && !usesVar(n))
            continue;
          if (styleIds && !usesStyle(n))
            continue;
          if (params.component) {
            if (n.type !== "INSTANCE")
              continue;
            const mc = await n.getMainComponentAsync();
            const set = mc && ((_c = mc.parent) == null ? void 0 : _c.type) === "COMPONENT_SET" ? mc.parent : null;
            const hit = mc && [mc.id, mc.name, set == null ? void 0 : set.id, set == null ? void 0 : set.name].includes(params.component);
            if (!hit)
              continue;
          }
          const info = params.fields ? pickFields(await layoutInfo(n, varName), params.fields) : nodeInfo(n);
          results.push(__spreadValues(__spreadValues({}, info), params.allPages ? { page: (_d = pageOf(n)) == null ? void 0 : _d.name } : {}));
        }
      }
      return results;
    },
    async export_node(params) {
      var _a, _b;
      const node = await requireNode(params.nodeId);
      if (!("exportAsync" in node))
        throw new Error("Node cannot be exported");
      const format = ((_a = params.format) != null ? _a : "PNG").toUpperCase();
      const settings = { format };
      if (format === "PNG" || format === "JPG") {
        settings.constraint = params.width ? { type: "WIDTH", value: params.width } : params.height ? { type: "HEIGHT", value: params.height } : { type: "SCALE", value: (_b = params.scale) != null ? _b : 1 };
      }
      if (format === "SVG") {
        for (const k of ["svgOutlineText", "svgIdAttribute", "svgSimplifyStroke"])
          if (params[k] !== void 0)
            settings[k] = params[k];
      }
      for (const k of ["contentsOnly", "useAbsoluteBounds"])
        if (params[k] !== void 0)
          settings[k] = params[k];
      const bytes = await node.exportAsync(settings);
      const out = __spreadValues({ nodeId: node.id, name: node.name, format }, bytesResult(bytes, format));
      if (format === "SVG") {
        const chunks = [];
        for (let i = 0; i < bytes.length; i += 8192)
          chunks.push(String.fromCharCode(...bytes.subarray(i, i + 8192)));
        out.svg = chunks.join("");
      }
      return out;
    },
    async get_image(params) {
      var _a;
      let hash = params.imageHash;
      if (!hash) {
        const node = await requireNode(params.nodeId);
        const images = ("fills" in node && Array.isArray(node.fills) ? node.fills : []).filter((p) => p.type === "IMAGE");
        const paint = images[(_a = params.index) != null ? _a : 0];
        if (!paint)
          throw new Error("Node has no image fill");
        hash = paint.imageHash;
      }
      const image = figma.getImageByHash(hash);
      if (!image)
        throw new Error(`Image not found: ${hash}`);
      const bytes = await image.getBytesAsync();
      const size = await image.getSizeAsync();
      const isJpg = bytes[0] === 255 && bytes[1] === 216;
      const isGif = bytes[0] === 71 && bytes[1] === 73;
      return __spreadValues(__spreadValues(__spreadValues({
        imageHash: hash
      }, size), bytesResult(bytes, isJpg ? "JPG" : "PNG")), isGif ? { mimeType: "image/gif" } : {});
    },
    async get_prototype(params) {
      const read2 = (n) => ({ id: n.id, name: n.name, type: n.type, reactions: JSON.parse(JSON.stringify(n.reactions)) });
      const withReactions = (root) => root.findAll((n) => "reactions" in n && n.reactions.length > 0).map(read2);
      if (!params.nodeId) {
        const page = params.pageId ? await requireNode(params.pageId) : figma.currentPage;
        if (page.type !== "PAGE")
          throw new Error(`Not a page: ${params.pageId}`);
        await page.loadAsync();
        return {
          flows: page.flowStartingPoints,
          prototypeBackgrounds: page.prototypeBackgrounds,
          nodes: withReactions(page)
        };
      }
      const node = await requireNode(params.nodeId);
      const out = "reactions" in node ? read2(node) : { id: node.id, name: node.name, type: node.type, reactions: [] };
      for (const k of ["overflowDirection", "numberOfFixedChildren"])
        if (k in node)
          out[k] = node[k];
      if (params.deep && "findAll" in node)
        out.children = withReactions(node);
      return out;
    },
    async get_plugin_data(params) {
      const node = await requireNode(params.nodeId);
      const ns = params.namespace;
      if (params.key)
        return { value: ns ? node.getSharedPluginData(ns, params.key) : node.getPluginData(params.key) };
      const keys = ns ? node.getSharedPluginDataKeys(ns) : node.getPluginDataKeys();
      return Object.fromEntries(keys.map((k) => [k, ns ? node.getSharedPluginData(ns, k) : node.getPluginData(k)]));
    },
    async get_export_settings(params) {
      const node = await requireNode(params.nodeId);
      return { nodeId: node.id, exportSettings: "exportSettings" in node ? node.exportSettings : [] };
    },
    get_file_info() {
      var _a;
      return {
        fileKey: (_a = figma.fileKey) != null ? _a : null,
        fileName: figma.root.name,
        currentPage: { id: figma.currentPage.id, name: figma.currentPage.name },
        editorType: figma.editorType,
        mode: figma.mode,
        apiVersion: figma.apiVersion
      };
    },
    async export_svg(params) {
      const node = await requireNode(params.nodeId);
      const bytes = await node.exportAsync({ format: "SVG" });
      const chunks = [];
      const CHUNK = 8192;
      for (let i = 0; i < bytes.length; i += CHUNK) {
        chunks.push(String.fromCharCode(...bytes.subarray(i, i + CHUNK)));
      }
      const svg = chunks.join("");
      return { svg };
    }
  };

  // src/handlers/edit.js
  var editHandlers = {
    async rename(params) {
      const node = await requireNode(params.nodeId);
      const oldName = node.name;
      node.name = params.name;
      return { success: true, oldName, newName: node.name };
    },
    async move(params) {
      const node = await requireNode(params.nodeId);
      if (!("x" in node))
        throw new Error("Node is not positionable");
      if (params.x !== void 0)
        node.x = params.x;
      if (params.y !== void 0)
        node.y = params.y;
      return { success: true, x: node.x, y: node.y };
    },
    async move_by(params) {
      var _a, _b;
      const node = await requireNode(params.nodeId);
      if (!("x" in node))
        throw new Error("Node is not positionable");
      node.x += (_a = params.dx) != null ? _a : 0;
      node.y += (_b = params.dy) != null ? _b : 0;
      return { success: true, x: node.x, y: node.y };
    },
    async resize(params) {
      var _a, _b;
      const node = await requireNode(params.nodeId);
      const w = (_a = params.width) != null ? _a : node.width;
      const h = (_b = params.height) != null ? _b : node.height;
      if (params.withConstraints) {
        if (!("resize" in node))
          throw new Error(`${node.type} cannot resize with constraints`);
        node.resize(w, h);
      } else if ("resizeWithoutConstraints" in node) {
        node.resizeWithoutConstraints(w, h);
      } else if ("resize" in node) {
        node.resize(w, h);
      } else {
        throw new Error("Node is not resizable");
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
      if (node.type !== "TEXT")
        throw new Error("Node is not a text layer");
      await loadNodeFonts(node);
      const oldText = node.characters;
      node.characters = params.text;
      return { success: true, oldText, newText: node.characters };
    },
    async set_fill(params) {
      const node = await requireNode(params.nodeId);
      if (!("fills" in node))
        throw new Error("Node does not support fills");
      if (params.color === null) {
        node.fills = [];
      } else {
        node.fills = [solidPaint(params.color, params.opacity)];
      }
      return { success: true };
    },
    async set_stroke(params) {
      const node = await requireNode(params.nodeId);
      if (!("strokes" in node))
        throw new Error("Node does not support strokes");
      if (params.color === null) {
        node.strokes = [];
      } else {
        node.strokes = [solidPaint(params.color, params.opacity)];
        if (params.weight !== void 0)
          node.strokeWeight = params.weight;
        if (params.align !== void 0)
          node.strokeAlign = params.align;
      }
      return { success: true };
    },
    async set_corner_radius(params) {
      const node = await requireNode(params.nodeId);
      if ("cornerRadius" in node) {
        node.cornerRadius = params.radius;
      } else {
        throw new Error("Node does not support corner radius");
      }
      return { success: true };
    },
    async set_opacity(params) {
      const node = await requireNode(params.nodeId);
      node.opacity = params.opacity;
      return { success: true };
    },
    async set_effect(params) {
      var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l;
      const node = await requireNode(params.nodeId);
      if (!("effects" in node))
        throw new Error("Node does not support effects");
      if (params.effect) {
        node.effects = [...node.effects, normalizeEffect(params.effect)];
        return { success: true, effectCount: node.effects.length };
      }
      const effectType = (_a = params.effectType) != null ? _a : "DROP_SHADOW";
      const isBlur = effectType === "LAYER_BLUR" || effectType === "BACKGROUND_BLUR";
      const effect = isBlur ? { type: effectType, visible: true, radius: (_c = (_b = params.blur) != null ? _b : params.radius) != null ? _c : 8 } : {
        type: effectType,
        visible: true,
        blendMode: (_d = params.blendMode) != null ? _d : "NORMAL",
        // A CSS color string keeps its own alpha ('#0000001A'); an {r,g,b} object defaults to 0.15.
        color: toRGBA(
          (_e = params.color) != null ? _e : { r: 0, g: 0, b: 0 },
          (_g = (_f = params.opacity) != null ? _f : params.alpha) != null ? _g : isColorInput(params.color) ? void 0 : 0.15
        ),
        offset: { x: (_h = params.offsetX) != null ? _h : 0, y: (_i = params.offsetY) != null ? _i : 4 },
        radius: (_k = (_j = params.blur) != null ? _j : params.radius) != null ? _k : 8,
        spread: (_l = params.spread) != null ? _l : 0
      };
      node.effects = [...node.effects, effect];
      return { success: true };
    },
    async set_effects(params) {
      const node = await requireNode(params.nodeId);
      if (!("effects" in node))
        throw new Error("Node does not support effects");
      node.effects = params.effects.map(normalizeEffect);
      return { success: true, effectCount: node.effects.length };
    },
    async set_font(params) {
      var _a, _b, _c;
      const node = await requireNode(params.nodeId);
      if (node.type !== "TEXT")
        throw new Error("Node is not a text layer");
      await loadNodeFonts(node);
      if (params.family !== void 0 || params.style !== void 0 || params.variationSettings !== void 0) {
        const cur = node.fontName === figma.mixed ? null : node.fontName;
        const font = { family: (_b = (_a = params.family) != null ? _a : cur == null ? void 0 : cur.family) != null ? _b : "Inter" };
        const style = (_c = params.style) != null ? _c : params.variationSettings ? void 0 : params.family ? "Regular" : cur == null ? void 0 : cur.style;
        if (style)
          font.style = style;
        if (params.variationSettings)
          font.variationSettings = params.variationSettings;
        await loadFont(font);
        node.fontName = font;
      }
      applyTextProps(node, params);
      if (params.align !== void 0)
        node.textAlignHorizontal = params.align;
      if (params.verticalAlign !== void 0)
        node.textAlignVertical = params.verticalAlign;
      if (params.maxLines !== void 0)
        node.maxLines = params.maxLines;
      if (params.truncation !== void 0)
        node.textTruncation = params.truncation;
      return { success: true, fontName: node.fontName === figma.mixed ? "mixed" : node.fontName };
    },
    async set_layout(params) {
      const node = await requireNode(params.nodeId);
      if (!("layoutMode" in node))
        throw new Error(`Node does not support auto-layout: ${node.type}`);
      if (params.mode !== void 0)
        node.layoutMode = params.mode;
      if (params.gap !== void 0)
        node.itemSpacing = params.gap;
      if (params.paddingTop !== void 0)
        node.paddingTop = params.paddingTop;
      if (params.paddingBottom !== void 0)
        node.paddingBottom = params.paddingBottom;
      if (params.paddingLeft !== void 0)
        node.paddingLeft = params.paddingLeft;
      if (params.paddingRight !== void 0)
        node.paddingRight = params.paddingRight;
      if (params.padding !== void 0) {
        node.paddingTop = node.paddingBottom = node.paddingLeft = node.paddingRight = params.padding;
      }
      if (params.align !== void 0)
        node.primaryAxisAlignItems = params.align;
      if (params.counterAlign !== void 0)
        node.counterAxisAlignItems = params.counterAlign;
      if (params.wrap !== void 0)
        node.layoutWrap = params.wrap ? "WRAP" : "NO_WRAP";
      if (params.counterGap !== void 0)
        node.counterAxisSpacing = params.counterGap;
      if (params.alignContent !== void 0)
        node.counterAxisAlignContent = params.alignContent;
      if (params.rows !== void 0)
        node.gridRowCount = params.rows;
      if (params.columns !== void 0)
        node.gridColumnCount = params.columns;
      if (params.rowGap !== void 0)
        node.gridRowGap = params.rowGap;
      if (params.columnGap !== void 0)
        node.gridColumnGap = params.columnGap;
      if (params.rowSizes !== void 0)
        node.gridRowSizes = params.rowSizes;
      if (params.columnSizes !== void 0)
        node.gridColumnSizes = params.columnSizes;
      return { success: true };
    },
    async set_grid_child(params) {
      var _a, _b, _c;
      const node = await requireNode(params.nodeId);
      if (((_a = node.parent) == null ? void 0 : _a.layoutMode) !== "GRID")
        throw new Error("Node is not a direct child of a GRID frame");
      if (params.row !== void 0 || params.column !== void 0) {
        node.setGridChildPosition((_b = params.row) != null ? _b : node.gridRowAnchorIndex, (_c = params.column) != null ? _c : node.gridColumnAnchorIndex);
      }
      if (params.rowSpan !== void 0)
        node.gridRowSpan = params.rowSpan;
      if (params.columnSpan !== void 0)
        node.gridColumnSpan = params.columnSpan;
      if (params.horizontalAlign !== void 0)
        node.gridChildHorizontalAlign = params.horizontalAlign;
      if (params.verticalAlign !== void 0)
        node.gridChildVerticalAlign = params.verticalAlign;
      return {
        success: true,
        row: node.gridRowAnchorIndex,
        column: node.gridColumnAnchorIndex,
        rowSpan: node.gridRowSpan,
        columnSpan: node.gridColumnSpan
      };
    },
    async set_strokes(params) {
      const node = await requireNode(params.nodeId);
      if (!("strokes" in node))
        throw new Error("Node does not support strokes");
      node.strokes = params.strokes.map(normalizePaint);
      return { success: true };
    },
    async add_stroke(params) {
      const node = await requireNode(params.nodeId);
      if (!("strokes" in node))
        throw new Error("Node does not support strokes");
      node.strokes = [...node.strokes, normalizePaint(params.stroke)];
      return { success: true, strokeCount: node.strokes.length };
    },
    async remove_stroke(params) {
      var _a;
      const node = await requireNode(params.nodeId);
      if (!("strokes" in node))
        throw new Error("Node does not support strokes");
      const strokes = [...node.strokes];
      const idx = (_a = params.index) != null ? _a : strokes.length - 1;
      strokes.splice(idx, 1);
      node.strokes = strokes;
      return { success: true, strokeCount: node.strokes.length };
    },
    async set_stroke_dash(params) {
      const node = await requireNode(params.nodeId);
      if (!("dashPattern" in node))
        throw new Error("Node does not support dash pattern");
      node.dashPattern = params.dashPattern;
      return { success: true, dashPattern: node.dashPattern };
    },
    async set_text_auto_resize(params) {
      const node = await requireNode(params.nodeId);
      if (node.type !== "TEXT")
        throw new Error("Node is not a text layer");
      node.textAutoResize = params.mode;
      return { success: true, textAutoResize: node.textAutoResize };
    },
    async set_corner_radii(params) {
      const node = await requireNode(params.nodeId);
      if (!("topLeftRadius" in node))
        throw new Error("Node does not support individual corner radii");
      if (params.topLeft !== void 0)
        node.topLeftRadius = params.topLeft;
      if (params.topRight !== void 0)
        node.topRightRadius = params.topRight;
      if (params.bottomRight !== void 0)
        node.bottomRightRadius = params.bottomRight;
      if (params.bottomLeft !== void 0)
        node.bottomLeftRadius = params.bottomLeft;
      return { success: true, topLeft: node.topLeftRadius, topRight: node.topRightRadius, bottomRight: node.bottomRightRadius, bottomLeft: node.bottomLeftRadius };
    },
    async set_layout_positioning(params) {
      const node = await requireNode(params.nodeId);
      if (!("layoutPositioning" in node))
        throw new Error("Node does not support layoutPositioning");
      node.layoutPositioning = params.positioning;
      return { success: true, layoutPositioning: node.layoutPositioning };
    },
    async set_min_max_size(params) {
      const node = await requireNode(params.nodeId);
      if (params.minWidth !== void 0)
        node.minWidth = params.minWidth;
      if (params.maxWidth !== void 0)
        node.maxWidth = params.maxWidth;
      if (params.minHeight !== void 0)
        node.minHeight = params.minHeight;
      if (params.maxHeight !== void 0)
        node.maxHeight = params.maxHeight;
      return { success: true, minWidth: node.minWidth, maxWidth: node.maxWidth, minHeight: node.minHeight, maxHeight: node.maxHeight };
    },
    async set_fills(params) {
      const node = await requireNode(params.nodeId);
      if (!("fills" in node))
        throw new Error("Node does not support fills");
      node.fills = params.fills.map(normalizePaint);
      return { success: true };
    },
    async add_fill(params) {
      const node = await requireNode(params.nodeId);
      if (!("fills" in node))
        throw new Error("Node does not support fills");
      if (!Array.isArray(node.fills))
        throw new Error("This text has different fills per range \u2014 use set_fills or set_text_range");
      node.fills = [...node.fills, normalizePaint(params.fill)];
      return { success: true, fillCount: node.fills.length };
    },
    async remove_fill(params) {
      var _a;
      const node = await requireNode(params.nodeId);
      if (!("fills" in node))
        throw new Error("Node does not support fills");
      if (!Array.isArray(node.fills))
        throw new Error("This text has different fills per range \u2014 use set_fills or set_text_range");
      const fills = [...node.fills];
      const idx = (_a = params.index) != null ? _a : fills.length - 1;
      fills.splice(idx, 1);
      node.fills = fills;
      return { success: true, fillCount: node.fills.length };
    },
    async set_image_fill(params) {
      var _a;
      const node = await requireNode(params.nodeId);
      if (!("fills" in node))
        throw new Error("Node does not support fills");
      let image;
      if (params.base64) {
        image = figma.createImage(figma.base64Decode(params.base64));
      } else if (params.url) {
        const response = await fetch(params.url);
        if (!response.ok)
          throw new Error(`Image download failed: HTTP ${response.status}`);
        image = figma.createImage(new Uint8Array(await response.arrayBuffer()));
      } else if (params.imageHash) {
        image = figma.getImageByHash(params.imageHash);
        if (!image)
          throw new Error(`Image not found: ${params.imageHash}`);
      } else {
        throw new Error("Provide url, base64 or imageHash");
      }
      const paint = { type: "IMAGE", imageHash: image.hash, scaleMode: (_a = params.scaleMode) != null ? _a : "FILL" };
      if (params.scalingFactor !== void 0)
        paint.scalingFactor = params.scalingFactor;
      if (params.rotation !== void 0)
        paint.rotation = params.rotation;
      node.fills = [paint];
      const size = await image.getSizeAsync();
      return __spreadValues({ success: true, imageHash: image.hash }, size);
    },
    async rotate(params) {
      const node = await requireNode(params.nodeId);
      if (!("rotation" in node))
        throw new Error("Node does not support rotation");
      node.rotation = params.angle;
      return { success: true, rotation: node.rotation };
    },
    async set_constraints(params) {
      var _a, _b;
      const node = await requireNode(params.nodeId);
      if (node.type === "GROUP" || node.type === "BOOLEAN_OPERATION") {
        throw new Error(`A ${node.type} has no constraints of its own \u2014 set them on its children (they follow the nearest parent frame), or turn the group into a frame`);
      }
      if (!("constraints" in node))
        throw new Error(`${node.type} does not support constraints`);
      const alias = { LEFT: "MIN", TOP: "MIN", RIGHT: "MAX", BOTTOM: "MAX", LEFT_RIGHT: "STRETCH", TOP_BOTTOM: "STRETCH" };
      const norm = (v) => {
        var _a2;
        return v === void 0 ? void 0 : (_a2 = alias[String(v).toUpperCase()]) != null ? _a2 : String(v).toUpperCase();
      };
      try {
        node.constraints = {
          horizontal: (_a = norm(params.horizontal)) != null ? _a : node.constraints.horizontal,
          vertical: (_b = norm(params.vertical)) != null ? _b : node.constraints.vertical
        };
      } catch (e) {
        if (/cannot be overridden/.test(errorMessage(e))) {
          throw new Error("Constraints of a layer inside an instance cannot be overridden \u2014 change them in the main component");
        }
        throw e;
      }
      let frame = node.parent;
      while (frame && frame.type === "GROUP")
        frame = frame.parent;
      let warning;
      if (!frame || frame.type === "PAGE" || frame.type === "SECTION") {
        warning = `No effect here: constraints follow a parent frame, and this node sits directly in a ${frame ? frame.type : "page"}`;
      } else if ("layoutMode" in frame && frame.layoutMode !== "NONE" && node.layoutPositioning !== "ABSOLUTE" && frame === node.parent) {
        warning = "Ignored while the node is in auto-layout flow \u2014 set_layout_positioning ABSOLUTE first, or use set_sizing / alignment instead";
      }
      return __spreadValues({ success: true, constraints: node.constraints }, warning ? { warning } : {});
    },
    async get_constraints(params) {
      const node = await requireNode(params.nodeId);
      if (!("constraints" in node))
        throw new Error("Node does not support constraints");
      return { nodeId: node.id, constraints: node.constraints };
    },
    async boolean_operation(params) {
      const nodes = await Promise.all(params.nodeIds.map((id) => figma.getNodeByIdAsync(id)));
      const valid = nodes.filter(Boolean);
      if (valid.length < 2)
        throw new Error("Need at least 2 nodes for boolean operation");
      const parent = valid[0].parent;
      let result;
      switch (params.operation) {
        case "UNION":
          result = figma.union(valid, parent);
          break;
        case "INTERSECT":
          result = figma.intersect(valid, parent);
          break;
        case "SUBTRACT":
          result = figma.subtract(valid, parent);
          break;
        case "EXCLUDE":
          result = figma.exclude(valid, parent);
          break;
        default:
          throw new Error(`Unknown operation: ${params.operation}`);
      }
      if (params.name)
        result.name = params.name;
      return __spreadValues({ success: true }, nodeInfo(result));
    },
    async set_sizing(params) {
      var _a;
      const node = await requireNode(params.nodeId);
      const mode = params.mode;
      const axis = (_a = params.axis) != null ? _a : "both";
      if (!("layoutSizingHorizontal" in node))
        throw new Error("Node does not support layout sizing");
      if (axis === "horizontal" || axis === "both")
        node.layoutSizingHorizontal = mode;
      if (axis === "vertical" || axis === "both")
        node.layoutSizingVertical = mode;
      return { success: true, nodeId: node.id, axis, mode };
    },
    async set_blend_mode(params) {
      const node = await requireNode(params.nodeId);
      if (!("blendMode" in node))
        throw new Error("Node does not support blend modes");
      node.blendMode = params.blendMode;
      return { success: true };
    },
    async set_annotation(params) {
      const node = await requireNode(params.nodeId);
      if (!("annotations" in node))
        throw new Error("Node does not support annotations");
      if (params.annotations) {
        node.annotations = params.annotations;
      } else if (params.label || params.properties) {
        const a = {};
        if (params.label)
          a.labelMarkdown = String(params.label);
        if (params.properties)
          a.properties = params.properties;
        if (params.categoryId)
          a.categoryId = params.categoryId;
        node.annotations = [a];
      } else {
        node.annotations = [];
      }
      return { success: true, annotations: node.annotations };
    },
    async set_text_range(params) {
      var _a, _b;
      if (params.scopeId !== void 0)
        return setTextRangeInScope(params);
      const node = await requireNode(params.nodeId);
      if (node.type !== "TEXT")
        throw new Error("Node is not a text layer");
      await loadNodeFonts(node);
      let ranges;
      let notFound = [];
      if (params.match !== void 0) {
        const phrases = matchPhrases(params.match);
        ({ ranges, notFound } = findPhrases(node.characters, phrases));
        if (!ranges.length)
          throw new Error(`Text not found: ${phrases.map((p) => `"${p}"`).join(", ")}`);
      } else {
        ranges = [[(_a = params.start) != null ? _a : 0, (_b = params.end) != null ? _b : node.characters.length]];
      }
      for (const [a, b] of ranges)
        await styleTextRange(node, a, b, params);
      return notFound.length ? { success: true, ranges, notFound } : { success: true, ranges };
    },
    async set_layout_grids(params) {
      var _a;
      const node = await requireNode(params.nodeId);
      if (!("layoutGrids" in node))
        throw new Error(`Node does not support layout grids: ${node.type}`);
      node.layoutGrids = ((_a = params.grids) != null ? _a : []).map(normalizeGrid);
      return { success: true, layoutGrids: node.layoutGrids.map(describeGrid) };
    },
    async set_locked(params) {
      var _a;
      const node = await requireNode(params.nodeId);
      node.locked = (_a = params.locked) != null ? _a : true;
      return { success: true, locked: node.locked };
    },
    async set_properties(params) {
      var _a;
      const node = await requireNode(params.nodeId);
      if (node.type === "TEXT")
        await loadNodeFonts(node);
      const applied = [];
      const errors = {};
      for (const [k, v] of Object.entries((_a = params.properties) != null ? _a : {})) {
        try {
          if (!(k in node))
            throw new Error(`no property "${k}" on ${node.type}`);
          node[k] = (k === "fills" || k === "strokes") && Array.isArray(v) ? v.map(normalizePaint) : k === "effects" && Array.isArray(v) ? v.map(normalizeEffect) : k === "layoutGrids" && Array.isArray(v) ? v.map(normalizeGrid) : v;
          applied.push(k);
        } catch (e) {
          errors[k] = errorMessage(e);
        }
      }
      return __spreadValues({ success: !Object.keys(errors).length, applied }, Object.keys(errors).length ? { errors } : {});
    },
    async set_export_settings(params) {
      var _a;
      const node = await requireNode(params.nodeId);
      if (!("exportSettings" in node))
        throw new Error("Node has no export settings");
      node.exportSettings = (_a = params.settings) != null ? _a : [];
      return { success: true, exportSettings: node.exportSettings };
    },
    async set_reactions(params) {
      var _a;
      const node = await requireNode(params.nodeId);
      if (!("setReactionsAsync" in node))
        throw new Error("Node does not support prototype reactions");
      await node.setReactionsAsync((_a = params.reactions) != null ? _a : []);
      return { success: true, reactions: JSON.parse(JSON.stringify(node.reactions)) };
    },
    async set_flow_starting_points(params) {
      var _a;
      const flows = (_a = params.flows) != null ? _a : [];
      let page;
      if (params.pageId)
        page = await requireNode(params.pageId);
      else if (flows.length)
        page = pageNodeOf(await requireNode(flows[0].nodeId));
      else
        page = figma.currentPage;
      if (!page || page.type !== "PAGE")
        throw new Error("Page not found");
      page.flowStartingPoints = flows.map((f) => {
        var _a2;
        return { nodeId: f.nodeId, name: (_a2 = f.name) != null ? _a2 : "Flow" };
      });
      return { success: true, pageId: page.id, flows: page.flowStartingPoints };
    },
    async set_plugin_data(params) {
      const node = await requireNode(params.nodeId);
      const value = typeof params.value === "string" ? params.value : JSON.stringify(params.value);
      if (params.namespace)
        node.setSharedPluginData(params.namespace, params.key, value);
      else
        node.setPluginData(params.key, value);
      return { success: true };
    }
  };
  function matchPhrases(match) {
    const phrases = Array.isArray(match) ? match : [match];
    if (!phrases.length || phrases.some((p) => typeof p !== "string" || !p)) {
      throw new Error("match must be a non-empty string or a list of them");
    }
    return phrases;
  }
  function findPhrases(text, phrases) {
    const ranges = [];
    const notFound = [];
    for (const p of phrases) {
      let i = text.indexOf(p);
      if (i === -1)
        notFound.push(p);
      while (i !== -1) {
        ranges.push([i, i + p.length]);
        i = text.indexOf(p, i + p.length);
      }
    }
    ranges.sort((x, y) => x[0] - y[0]);
    return { ranges, notFound };
  }
  async function styleTextRange(node, a, b, params) {
    var _a, _b;
    if (params.family !== void 0 || params.style !== void 0 || params.variationSettings !== void 0) {
      const cur = node.getRangeFontName(a, a + 1);
      const font = { family: (_a = params.family) != null ? _a : cur.family };
      const style = (_b = params.style) != null ? _b : params.variationSettings ? void 0 : params.family ? "Regular" : cur.style;
      if (style)
        font.style = style;
      if (params.variationSettings)
        font.variationSettings = params.variationSettings;
      await loadFont(font);
      node.setRangeFontName(a, b, font);
    }
    if (params.size !== void 0)
      node.setRangeFontSize(a, b, params.size);
    if (params.fills !== void 0)
      node.setRangeFills(a, b, params.fills.map(normalizePaint));
    else if (params.color !== void 0)
      node.setRangeFills(a, b, [solidPaint(params.color, params.opacity)]);
    if (params.lineHeight !== void 0)
      node.setRangeLineHeight(a, b, parseLineHeight(params.lineHeight));
    if (params.letterSpacing !== void 0)
      node.setRangeLetterSpacing(a, b, parseLetterSpacing(params.letterSpacing));
    if (params.textCase !== void 0)
      node.setRangeTextCase(a, b, params.textCase);
    if (params.textDecoration !== void 0)
      node.setRangeTextDecoration(a, b, params.textDecoration);
    if (params.hyperlink !== void 0) {
      const link = params.hyperlink === null ? null : typeof params.hyperlink === "string" ? { type: "URL", value: params.hyperlink } : params.hyperlink;
      node.setRangeHyperlink(a, b, link);
    }
    if (params.listType !== void 0)
      node.setRangeListOptions(a, b, { type: params.listType });
    if (params.indentation !== void 0)
      node.setRangeIndentation(a, b, params.indentation);
    if (params.paragraphSpacing !== void 0)
      node.setRangeParagraphSpacing(a, b, params.paragraphSpacing);
    if (params.paragraphIndent !== void 0)
      node.setRangeParagraphIndent(a, b, params.paragraphIndent);
    if (params.textStyleId !== void 0)
      await node.setRangeTextStyleIdAsync(a, b, params.textStyleId);
    if (params.fillStyleId !== void 0)
      await node.setRangeFillStyleIdAsync(a, b, params.fillStyleId);
  }
  async function setTextRangeInScope(params) {
    if (params.match === void 0)
      throw new Error("scopeId needs match \u2014 start/end only make sense for one text");
    const phrases = matchPhrases(params.match);
    const scope = await resolveScope(params.scopeId);
    const texts = scope.type === "TEXT" ? [scope] : "findAllWithCriteria" in scope ? scope.findAllWithCriteria({ types: ["TEXT"] }) : [];
    const applied = [];
    const errors = [];
    const found = /* @__PURE__ */ new Set();
    const run = runState.current;
    let lastYield = Date.now();
    for (const node of texts) {
      if (Date.now() - lastYield > 50) {
        await new Promise((resolve) => setTimeout(resolve, 0));
        lastYield = Date.now();
      }
      if (run && run.aborted)
        break;
      let { ranges } = findPhrases(node.characters, phrases);
      if (params.onlyFontSize !== void 0)
        ranges = ranges.filter(([a, b]) => node.getRangeFontSize(a, b) === params.onlyFontSize);
      if (!ranges.length)
        continue;
      try {
        await loadNodeFonts(node);
        for (const [a, b] of ranges)
          await styleTextRange(node, a, b, params);
        for (const [a, b] of ranges)
          found.add(node.characters.slice(a, b));
        applied.push({ nodeId: node.id, name: node.name, ranges });
      } catch (e) {
        errors.push({ nodeId: node.id, name: node.name, error: errorMessage(e) });
      }
    }
    const notFound = phrases.filter((p) => !found.has(p));
    const result = { success: true, texts: texts.length, applied };
    if (notFound.length)
      result.notFound = notFound;
    if (errors.length)
      result.errors = errors;
    return result;
  }

  // src/handlers/create.js
  var createHandlers = {
    async duplicate(params) {
      const node = await requireNode(params.nodeId);
      const clone = node.clone();
      if (params.x !== void 0)
        clone.x = params.x;
      if (params.y !== void 0)
        clone.y = params.y;
      return { success: true, id: clone.id, name: clone.name };
    },
    async create_frame(params) {
      var _a, _b, _c;
      const parent = await resolveParent(params.parentId);
      const frame = figma.createFrame();
      frame.name = (_a = params.name) != null ? _a : "Frame";
      frame.resize((_b = params.width) != null ? _b : 100, (_c = params.height) != null ? _c : 100);
      if (params.x !== void 0)
        frame.x = params.x;
      if (params.y !== void 0)
        frame.y = params.y;
      if (parent)
        parent.appendChild(frame);
      if (params.fill !== void 0) {
        frame.fills = [solidPaint(params.fill, params.fillOpacity)];
      } else {
        frame.fills = [];
      }
      if (params.cornerRadius !== void 0)
        frame.cornerRadius = params.cornerRadius;
      if (params.clipsContent !== void 0)
        frame.clipsContent = params.clipsContent;
      return __spreadValues({ success: true }, nodeInfo(frame));
    },
    async create_rectangle(params) {
      var _a, _b, _c, _d;
      const parent = await resolveParent(params.parentId);
      const rect = figma.createRectangle();
      rect.name = (_a = params.name) != null ? _a : "Rectangle";
      rect.resize((_b = params.width) != null ? _b : 100, (_c = params.height) != null ? _c : 100);
      if (params.x !== void 0)
        rect.x = params.x;
      if (params.y !== void 0)
        rect.y = params.y;
      if (parent)
        parent.appendChild(rect);
      if (params.fill !== void 0)
        rect.fills = [solidPaint(params.fill, params.fillOpacity)];
      if (params.cornerRadius !== void 0)
        rect.cornerRadius = params.cornerRadius;
      if (params.stroke !== void 0) {
        rect.strokes = [solidPaint(params.stroke)];
        rect.strokeWeight = (_d = params.strokeWeight) != null ? _d : 1;
      }
      return __spreadValues({ success: true }, nodeInfo(rect));
    },
    async create_text(params) {
      var _a, _b, _c, _d;
      const parent = await resolveParent(params.parentId);
      const fontName = { family: (_a = params.fontFamily) != null ? _a : "Inter", style: (_b = params.fontStyle) != null ? _b : "Regular" };
      if (params.variationSettings)
        fontName.variationSettings = params.variationSettings;
      await loadFont(fontName);
      const text = figma.createText();
      text.name = (_c = params.name) != null ? _c : "Text";
      text.fontName = fontName;
      text.characters = (_d = params.text) != null ? _d : "";
      if (params.fontSize !== void 0)
        text.fontSize = params.fontSize;
      if (params.x !== void 0)
        text.x = params.x;
      if (params.y !== void 0)
        text.y = params.y;
      if (params.fill !== void 0)
        text.fills = [solidPaint(params.fill, params.fillOpacity)];
      if (params.textAlignHorizontal !== void 0)
        text.textAlignHorizontal = params.textAlignHorizontal;
      if (params.textWrapStyle !== void 0)
        text.textWrapStyle = params.textWrapStyle;
      if (parent)
        parent.appendChild(text);
      return __spreadValues({ success: true }, nodeInfo(text));
    },
    async create_ellipse(params) {
      var _a, _b, _c, _d;
      const parent = await resolveParent(params.parentId);
      const ellipse = figma.createEllipse();
      ellipse.name = (_a = params.name) != null ? _a : "Ellipse";
      ellipse.resize((_b = params.width) != null ? _b : 100, (_c = params.height) != null ? _c : 100);
      if (params.x !== void 0)
        ellipse.x = params.x;
      if (params.y !== void 0)
        ellipse.y = params.y;
      if (parent)
        parent.appendChild(ellipse);
      if (params.fill !== void 0)
        ellipse.fills = [solidPaint(params.fill, params.fillOpacity)];
      if (params.stroke !== void 0) {
        ellipse.strokes = [solidPaint(params.stroke)];
        ellipse.strokeWeight = (_d = params.strokeWeight) != null ? _d : 1;
      }
      return __spreadValues({ success: true }, nodeInfo(ellipse));
    },
    async create_line(params) {
      var _a, _b;
      const parent = await resolveParent(params.parentId);
      const line = figma.createLine();
      line.name = (_a = params.name) != null ? _a : "Line";
      if (params.x !== void 0)
        line.x = params.x;
      if (params.y !== void 0)
        line.y = params.y;
      if (params.length !== void 0)
        line.resize(params.length, 0);
      if (params.rotation !== void 0)
        line.rotation = params.rotation;
      if (parent)
        parent.appendChild(line);
      if (params.stroke !== void 0) {
        line.strokes = [solidPaint(params.stroke)];
        line.strokeWeight = (_b = params.strokeWeight) != null ? _b : 1;
      }
      return __spreadValues({ success: true }, nodeInfo(line));
    }
  };
  async function placeShape(node, params, defaultName) {
    var _a, _b, _c, _d;
    const parent = await resolveParent(params.parentId);
    node.name = (_a = params.name) != null ? _a : defaultName;
    if (params.width !== void 0 || params.height !== void 0) {
      node.resize((_b = params.width) != null ? _b : node.width, (_c = params.height) != null ? _c : node.height);
    }
    if (params.x !== void 0)
      node.x = params.x;
    if (params.y !== void 0)
      node.y = params.y;
    if (parent)
      parent.appendChild(node);
    if (params.fill !== void 0)
      node.fills = params.fill === null ? [] : [solidPaint(params.fill, params.fillOpacity)];
    if (params.stroke !== void 0) {
      node.strokes = [solidPaint(params.stroke)];
      node.strokeWeight = (_d = params.strokeWeight) != null ? _d : 1;
    }
    return node;
  }
  Object.assign(createHandlers, {
    async create_svg(params) {
      var _a, _b;
      if (typeof params.svg !== "string" || !params.svg.includes("<svg"))
        throw new Error("svg must be an SVG markup string");
      await resolveParent(params.parentId);
      const frame = figma.createNodeFromSvg(params.svg);
      if (params.width !== void 0 || params.height !== void 0) {
        frame.rescale(((_a = params.width) != null ? _a : frame.width * (params.height / frame.height)) / frame.width);
      }
      await placeShape(frame, __spreadProps(__spreadValues({}, params), { width: void 0, height: void 0 }), (_b = params.name) != null ? _b : "SVG");
      return __spreadProps(__spreadValues({ success: true }, nodeInfo(frame)), { childCount: frame.children.length });
    },
    async create_polygon(params) {
      var _a;
      const node = figma.createPolygon();
      node.pointCount = (_a = params.pointCount) != null ? _a : 3;
      await placeShape(node, params, "Polygon");
      return __spreadValues({ success: true }, nodeInfo(node));
    },
    async create_star(params) {
      var _a;
      const node = figma.createStar();
      node.pointCount = (_a = params.pointCount) != null ? _a : 5;
      if (params.innerRadius !== void 0)
        node.innerRadius = params.innerRadius;
      await placeShape(node, params, "Star");
      return __spreadValues({ success: true }, nodeInfo(node));
    },
    async create_vector(params) {
      var _a;
      const paths = (_a = params.paths) != null ? _a : [{ data: params.data }];
      const node = figma.createVector();
      try {
        node.vectorPaths = paths.map((p) => {
          var _a2;
          return { windingRule: (_a2 = p.windingRule) != null ? _a2 : "NONZERO", data: p.data };
        });
      } catch (e) {
        node.remove();
        throw e;
      }
      await placeShape(node, __spreadProps(__spreadValues({}, params), { width: void 0, height: void 0 }), "Vector");
      return __spreadValues({ success: true }, nodeInfo(node));
    },
    async get_vector(params) {
      const node = await requireNode(params.nodeId);
      if (!("vectorPaths" in node))
        throw new Error(`Node has no vector paths: ${node.type}`);
      return { id: node.id, name: node.name, type: node.type, width: node.width, height: node.height, paths: JSON.parse(JSON.stringify(node.vectorPaths)) };
    },
    async flatten(params) {
      const nodes = (await Promise.all(params.nodeIds.map((id) => figma.getNodeByIdAsync(id)))).filter(Boolean);
      if (!nodes.length)
        throw new Error("No nodes found");
      const vector = figma.flatten(nodes);
      if (params.name)
        vector.name = params.name;
      return __spreadValues({ success: true }, nodeInfo(vector));
    },
    async outline_stroke(params) {
      const node = await requireNode(params.nodeId);
      if (!("outlineStroke" in node))
        throw new Error("Node has no outlineable stroke");
      const vector = node.outlineStroke();
      if (!vector)
        throw new Error("Node has no visible stroke");
      return __spreadValues({ success: true }, nodeInfo(vector));
    },
    async set_mask(params) {
      var _a;
      const node = await requireNode(params.nodeId);
      if (!("isMask" in node))
        throw new Error("Node cannot be a mask");
      node.isMask = (_a = params.isMask) != null ? _a : true;
      if (params.maskType !== void 0)
        node.maskType = params.maskType;
      return { success: true, isMask: node.isMask, maskType: node.maskType };
    }
  });

  // src/handlers/variables.js
  async function findVariable(ref) {
    var _a;
    const byId = await figma.variables.getVariableByIdAsync(ref);
    if (byId)
      return byId;
    const all = await figma.variables.getLocalVariablesAsync();
    return (_a = all.find((v) => v.name === ref)) != null ? _a : null;
  }
  async function variableValue(variable, value) {
    var _a;
    if (value && typeof value === "object" && (value.alias !== void 0 || value.type === "VARIABLE_ALIAS")) {
      const ref = (_a = value.alias) != null ? _a : value.id;
      const target = await findVariable(ref);
      if (!target)
        throw new Error(`Alias target not found: ${ref}`);
      return figma.variables.createVariableAlias(target);
    }
    return variable.resolvedType === "COLOR" && isColorInput(value) ? figma.util.rgba(value) : value;
  }
  async function describeValues(valuesByMode) {
    return Object.fromEntries(await Promise.all(Object.entries(valuesByMode).map(async ([modeId, val]) => {
      if (val && typeof val === "object" && val.type === "VARIABLE_ALIAS") {
        const ref = await figma.variables.getVariableByIdAsync(val.id);
        return [modeId, { alias: ref ? ref.name : val.id, aliasId: val.id }];
      }
      return [modeId, val];
    })));
  }
  async function applyVariableMeta(variable, params) {
    var _a;
    if (params.name !== void 0 && params.name !== variable.name)
      variable.name = params.name;
    if (params.description !== void 0)
      variable.description = params.description;
    if (params.hiddenFromPublishing !== void 0)
      variable.hiddenFromPublishing = params.hiddenFromPublishing;
    if (params.scopes !== void 0)
      variable.scopes = params.scopes;
    if (params.codeSyntax) {
      for (const [platform, value] of Object.entries(params.codeSyntax)) {
        if (value)
          variable.setVariableCodeSyntax(platform, value);
        else
          variable.removeVariableCodeSyntax(platform);
      }
    }
    if (params.values) {
      const col = await figma.variables.getVariableCollectionByIdAsync(variable.variableCollectionId);
      for (const [mode, value] of Object.entries(params.values)) {
        const m = (_a = col.modes.find((x) => x.modeId === mode)) != null ? _a : col.modes.find((x) => x.name === mode);
        if (!m)
          throw new Error(`Mode not found in "${col.name}": ${mode}`);
        variable.setValueForMode(m.modeId, await variableValue(variable, value));
      }
    }
  }
  async function preloadVariableFont(node, prop, variable) {
    if (!variable || prop !== "fontFamily" && prop !== "fontStyle")
      return;
    const cur = node.fontName === figma.mixed ? null : node.fontName;
    const value = variable.resolveForConsumer(node).value;
    if (!cur || typeof value !== "string")
      return;
    const font = prop === "fontFamily" ? { family: value, style: cur.style } : { family: cur.family, style: value };
    await loadFont(font);
  }
  async function bindVariable(params, variable) {
    var _a, _b;
    const prop = params.property;
    const index = (_a = params.index) != null ? _a : 0;
    const bindPaint = (paints2) => {
      if (paints2 === figma.mixed)
        throw new Error("This text has different fills per range \u2014 bind with start / end, or set one fill first");
      if (!paints2 || !paints2[index])
        throw new Error(`No paint at index ${index}`);
      const out = [...paints2];
      out[index] = figma.variables.setBoundVariableForPaint(out[index], "color", variable);
      return out;
    };
    const bindEffect = async (effects2) => {
      var _a2, _b2;
      if (!effects2 || !effects2[index])
        throw new Error(`No effect at index ${index}`);
      const field = (_a2 = params.field) != null ? _a2 : "color";
      const out = [...effects2];
      let effect = figma.variables.setBoundVariableForEffect(out[index], field, variable);
      if (!variable) {
        for (const [f, alias] of Object.entries((_b2 = out[index].boundVariables) != null ? _b2 : {})) {
          if (f === field || !alias)
            continue;
          const keep = await figma.variables.getVariableByIdAsync(alias.id);
          if (keep)
            effect = figma.variables.setBoundVariableForEffect(effect, f, keep);
        }
      }
      out[index] = effect;
      return out;
    };
    const bindGrid = (grids) => {
      var _a2;
      if (!grids || !grids[index])
        throw new Error(`No layout grid at index ${index}`);
      const out = [...grids];
      out[index] = figma.variables.setBoundVariableForLayoutGrid(out[index], (_a2 = params.field) != null ? _a2 : "gutterSize", variable);
      return out;
    };
    if (params.styleId) {
      const style = await figma.getStyleByIdAsync(params.styleId);
      if (!style)
        throw new Error(`Style not found: ${params.styleId}`);
      if (style.type === "PAINT")
        style.paints = bindPaint(style.paints);
      else if (style.type === "EFFECT")
        style.effects = await bindEffect(style.effects);
      else if (style.type === "GRID")
        style.layoutGrids = bindGrid(style.layoutGrids);
      else if (style.type === "TEXT") {
        await loadFont(style.fontName);
        style.setBoundVariable(prop, variable);
      } else
        throw new Error(`Cannot bind variables on a ${style.type} style`);
      return { styleId: style.id, styleName: style.name };
    }
    const node = await requireNode(params.nodeId);
    if (prop === "fills" || prop === "strokes") {
      node[prop] = bindPaint(node[prop]);
    } else if (prop === "effects") {
      node.effects = await bindEffect(node.effects);
    } else if (prop === "layoutGrids") {
      node.layoutGrids = bindGrid(node.layoutGrids);
    } else if (node.type === "TEXT") {
      await loadNodeFonts(node);
      await preloadVariableFont(node, prop, variable);
      if (params.start !== void 0)
        node.setRangeBoundVariable(params.start, (_b = params.end) != null ? _b : node.characters.length, prop, variable);
      else
        node.setBoundVariable(prop, variable);
    } else {
      node.setBoundVariable(prop, variable);
    }
    return { nodeId: node.id };
  }
  var variablesHandlers = {
    async get_variables() {
      const collections = await figma.variables.getLocalVariableCollectionsAsync();
      return Promise.all(collections.map(async (col) => __spreadProps(__spreadValues(__spreadValues({
        id: col.id,
        key: col.key,
        name: col.name,
        modes: col.modes,
        defaultModeId: col.defaultModeId
      }, col.hiddenFromPublishing ? { hiddenFromPublishing: true } : {}), col.isExtension ? { isExtension: true, parentVariableCollectionId: col.parentVariableCollectionId } : {}), {
        variables: (await Promise.all(col.variableIds.map(async (vid) => {
          const v = await figma.variables.getVariableByIdAsync(vid);
          if (!v)
            return null;
          return __spreadProps(__spreadValues(__spreadValues({
            id: v.id,
            key: v.key,
            name: v.name,
            type: v.resolvedType,
            scopes: v.scopes
          }, v.description ? { description: v.description } : {}), v.hiddenFromPublishing ? { hiddenFromPublishing: true } : {}), {
            values: await describeValues(v.valuesByMode)
          });
        }))).filter(Boolean)
      })));
    },
    async get_variable(params) {
      const v = await figma.variables.getVariableByIdAsync(params.variableId);
      if (!v)
        throw new Error(`Variable not found: ${params.variableId}`);
      const col = await figma.variables.getVariableCollectionByIdAsync(v.variableCollectionId);
      return {
        id: v.id,
        key: v.key,
        name: v.name,
        type: v.resolvedType,
        description: v.description,
        scopes: v.scopes,
        codeSyntax: v.codeSyntax,
        remote: v.remote,
        hiddenFromPublishing: v.hiddenFromPublishing,
        collection: col ? { id: col.id, name: col.name, modes: col.modes } : null,
        values: await describeValues(v.valuesByMode)
      };
    },
    create_variable_collection(params) {
      const col = figma.variables.createVariableCollection(params.name);
      const modeNames = params.modes || ["Value"];
      col.renameMode(col.modes[0].modeId, modeNames[0]);
      for (let i = 1; i < modeNames.length; i++) {
        col.addMode(modeNames[i]);
      }
      return { id: col.id, name: col.name, modes: col.modes };
    },
    async create_variable(params) {
      const col = await figma.variables.getVariableCollectionByIdAsync(params.collectionId);
      if (!col)
        throw new Error(`Collection not found: ${params.collectionId}`);
      if (params.values !== void 0 && (typeof params.values !== "object" || Array.isArray(params.values))) {
        throw new Error("values must be an object: { modeId: value }");
      }
      const variable = figma.variables.createVariable(params.name, col, params.type);
      try {
        await applyVariableMeta(variable, params);
      } catch (e) {
        variable.remove();
        throw e;
      }
      return { id: variable.id, name: variable.name, type: variable.resolvedType, scopes: variable.scopes };
    },
    async update_variable(params) {
      const v = await figma.variables.getVariableByIdAsync(params.variableId);
      if (!v)
        throw new Error(`Variable not found: ${params.variableId}`);
      await applyVariableMeta(v, params);
      return { id: v.id, name: v.name, type: v.resolvedType, scopes: v.scopes };
    },
    async delete_variable(params) {
      const v = await figma.variables.getVariableByIdAsync(params.variableId);
      if (!v)
        throw new Error(`Variable not found: ${params.variableId}`);
      v.remove();
      return { success: true };
    },
    async delete_variable_collection(params) {
      const col = await figma.variables.getVariableCollectionByIdAsync(params.collectionId);
      if (!col)
        throw new Error(`Collection not found: ${params.collectionId}`);
      const count = col.variableIds.length;
      col.remove();
      return { success: true, deletedVariables: count };
    },
    async apply_variable(params) {
      const v = await figma.variables.getVariableByIdAsync(params.variableId);
      if (!v)
        throw new Error(`Variable not found: ${params.variableId}`);
      const target = await bindVariable(params, v);
      return __spreadProps(__spreadValues({ success: true }, target), { property: params.property, variableId: v.id, variableName: v.name });
    },
    async detach_variable(params) {
      const target = await bindVariable(params, null);
      return __spreadProps(__spreadValues({ success: true }, target), { property: params.property });
    },
    async get_variable_bindings(params) {
      var _a;
      const node = await requireNode(params.nodeId);
      const result = { nodeId: node.id, name: node.name, bindings: {} };
      const resolve = async (b) => {
        if (!b || !b.id)
          return null;
        const v = await figma.variables.getVariableByIdAsync(b.id);
        return v ? { id: v.id, name: v.name, type: v.resolvedType } : { id: b.id };
      };
      if ("boundVariables" in node && node.boundVariables) {
        for (const [prop, binding] of Object.entries(node.boundVariables)) {
          if (!binding)
            continue;
          result.bindings[prop] = Array.isArray(binding) ? await Promise.all(binding.map(resolve)) : await resolve(binding);
        }
      }
      if ("effects" in node && node.effects.some((e) => e.boundVariables && Object.keys(e.boundVariables).length)) {
        result.bindings.effects = await Promise.all(node.effects.map(async (e) => {
          var _a2;
          const entries = Object.entries((_a2 = e.boundVariables) != null ? _a2 : {});
          if (!entries.length)
            return null;
          return Object.fromEntries(await Promise.all(entries.map(async ([f, b]) => [f, await resolve(b)])));
        }));
      }
      for (const paintProp of ["fills", "strokes"]) {
        if (!(paintProp in node) || !Array.isArray(node[paintProp]))
          continue;
        const paints2 = node[paintProp];
        const paintBindings = [];
        for (const paint of paints2) {
          if ((_a = paint.boundVariables) == null ? void 0 : _a.color) {
            const v = await figma.variables.getVariableByIdAsync(paint.boundVariables.color.id);
            paintBindings.push(v ? { id: v.id, name: v.name, type: v.resolvedType } : null);
          } else {
            paintBindings.push(null);
          }
        }
        if (paintBindings.some((b) => b !== null)) {
          result.bindings[paintProp] = paintBindings;
        }
      }
      return result;
    },
    async add_mode(params) {
      const col = await figma.variables.getVariableCollectionByIdAsync(params.collectionId);
      if (!col)
        throw new Error(`Collection not found: ${params.collectionId}`);
      const modeId = col.addMode(params.name);
      return { success: true, collectionId: col.id, modeId, modeName: params.name, modes: col.modes };
    },
    async rename_mode(params) {
      const col = await figma.variables.getVariableCollectionByIdAsync(params.collectionId);
      if (!col)
        throw new Error(`Collection not found: ${params.collectionId}`);
      col.renameMode(params.modeId, params.name);
      return { success: true, collectionId: col.id, modeId: params.modeId, modes: col.modes };
    },
    async remove_mode(params) {
      const col = await figma.variables.getVariableCollectionByIdAsync(params.collectionId);
      if (!col)
        throw new Error(`Collection not found: ${params.collectionId}`);
      col.removeMode(params.modeId);
      return { success: true, collectionId: col.id, modes: col.modes };
    },
    async switch_mode(params) {
      const node = await requireNode(params.nodeId);
      if (!("setExplicitVariableModeForCollection" in node)) {
        throw new Error("Node does not support explicit variable modes");
      }
      const col = await figma.variables.getVariableCollectionByIdAsync(params.collectionId);
      if (!col)
        throw new Error(`Collection not found: ${params.collectionId}`);
      node.setExplicitVariableModeForCollection(col, params.modeId);
      return { success: true, nodeId: node.id, collectionId: params.collectionId, modeId: params.modeId };
    },
    async reset_mode(params) {
      const node = await requireNode(params.nodeId);
      if (!("clearExplicitVariableModeForCollection" in node)) {
        throw new Error("Node does not support explicit variable modes");
      }
      const col = await figma.variables.getVariableCollectionByIdAsync(params.collectionId);
      if (!col)
        throw new Error(`Collection not found: ${params.collectionId}`);
      node.clearExplicitVariableModeForCollection(col);
      return { success: true };
    },
    async update_variable_collection(params) {
      const col = await figma.variables.getVariableCollectionByIdAsync(params.collectionId);
      if (!col)
        throw new Error(`Collection not found: ${params.collectionId}`);
      if (params.name !== void 0)
        col.name = params.name;
      if (params.hiddenFromPublishing !== void 0)
        col.hiddenFromPublishing = params.hiddenFromPublishing;
      return { id: col.id, name: col.name, modes: col.modes };
    },
    async extend_variable_collection(params) {
      const col = await figma.variables.getVariableCollectionByIdAsync(params.collectionId);
      if (!col)
        throw new Error(`Collection not found: ${params.collectionId}`);
      if (typeof col.extend !== "function")
        throw new Error("Extended collections are not available in this Figma (Enterprise plans only)");
      const ext = col.extend(params.name);
      return { id: ext.id, name: ext.name, modes: ext.modes, parentVariableCollectionId: col.id };
    },
    async resolve_variable(params) {
      const v = await figma.variables.getVariableByIdAsync(params.variableId);
      if (!v)
        throw new Error(`Variable not found: ${params.variableId}`);
      if (params.nodeId) {
        const node = await requireNode(params.nodeId);
        const r = v.resolveForConsumer(node);
        return { id: v.id, name: v.name, type: r.resolvedType, value: r.value };
      }
      const resolveIn = async (variable, modeId, seen) => {
        let val = variable.valuesByMode[modeId];
        if (val === void 0) {
          const col2 = await figma.variables.getVariableCollectionByIdAsync(variable.variableCollectionId);
          val = variable.valuesByMode[col2.defaultModeId];
        }
        if (val && typeof val === "object" && val.type === "VARIABLE_ALIAS") {
          if (seen.has(val.id))
            throw new Error("Alias cycle");
          seen.add(val.id);
          const next = await figma.variables.getVariableByIdAsync(val.id);
          if (!next)
            return { brokenAlias: val.id };
          return __spreadValues({ via: next.name }, await resolveIn(next, modeId, seen));
        }
        return { value: val };
      };
      const col = await figma.variables.getVariableCollectionByIdAsync(v.variableCollectionId);
      const values = {};
      for (const m of col.modes)
        values[m.name] = await resolveIn(v, m.modeId, /* @__PURE__ */ new Set([v.id]));
      return { id: v.id, name: v.name, type: v.resolvedType, values };
    },
    async get_node_modes(params) {
      const node = await requireNode(params.nodeId);
      const named = async (map) => {
        const out = {};
        for (const [colId, modeId] of Object.entries(map || {})) {
          const col = await figma.variables.getVariableCollectionByIdAsync(colId);
          const mode = col ? col.modes.find((m) => m.modeId === modeId) : null;
          out[col ? col.name : colId] = { collectionId: colId, modeId, modeName: mode ? mode.name : null };
        }
        return out;
      };
      const inherited = {};
      for (let n = node; n && n.type !== "DOCUMENT"; n = n.parent) {
        for (const [colId, modeId] of Object.entries(n.explicitVariableModes || {})) {
          if (!(colId in inherited))
            inherited[colId] = modeId;
        }
      }
      return {
        nodeId: node.id,
        explicit: await named(node.explicitVariableModes),
        inherited: await named(inherited),
        resolved: await named(node.resolvedVariableModes)
      };
    }
  };

  // src/handlers/components.js
  var componentsHandlers = {
    async create_instance(params) {
      let comp = await figma.getNodeByIdAsync(params.componentId);
      if (comp && comp.type === "COMPONENT_SET")
        comp = comp.defaultVariant;
      if (!comp || comp.type !== "COMPONENT")
        throw new Error(`Not a component: ${params.componentId}`);
      const parent = await resolveParent(params.parentId);
      const instance = comp.createInstance();
      if (parent)
        parent.appendChild(instance);
      if (params.x !== void 0)
        instance.x = params.x;
      if (params.y !== void 0)
        instance.y = params.y;
      return { id: instance.id, name: instance.name, type: instance.type, x: instance.x, y: instance.y };
    },
    async add_component_property(params) {
      var _a, _b;
      const node = await requireNode(params.componentId);
      if (node.type !== "COMPONENT" && node.type !== "COMPONENT_SET")
        throw new Error("Node is not a component");
      const options = {};
      for (const k of ["preferredValues", "description", "slotSettings"]) {
        if (params[k] !== void 0)
          options[k] = params[k];
      }
      const key = Object.keys(options).length ? node.addComponentProperty(params.name, params.type, (_a = params.defaultValue) != null ? _a : "", options) : node.addComponentProperty(params.name, params.type, (_b = params.defaultValue) != null ? _b : "");
      return { key, name: params.name, type: params.type };
    },
    async edit_component_property(params) {
      const node = await requireNode(params.componentId);
      if (node.type !== "COMPONENT" && node.type !== "COMPONENT_SET")
        throw new Error("Node is not a component");
      const newValue = {};
      for (const k of ["name", "defaultValue", "preferredValues", "description", "slotSettings"]) {
        if (params[k] !== void 0)
          newValue[k] = params[k];
      }
      const key = node.editComponentProperty(params.propertyKey, newValue);
      return { success: true, oldKey: params.propertyKey, key };
    },
    async delete_component_property(params) {
      const node = await requireNode(params.componentId);
      if (node.type !== "COMPONENT" && node.type !== "COMPONENT_SET")
        throw new Error("Node is not a component");
      node.deleteComponentProperty(params.propertyKey);
      return { success: true, deletedKey: params.propertyKey };
    },
    async create_slot(params) {
      var _a;
      const comp = await requireNode(params.componentId);
      if (comp.type !== "COMPONENT")
        throw new Error("Node is not a component");
      const parent = await resolveParent(params.parentId);
      const before = new Set(Object.keys(comp.componentPropertyDefinitions));
      const slot = comp.createSlot();
      if (parent && parent !== comp)
        parent.appendChild(slot);
      let key = (_a = Object.keys(comp.componentPropertyDefinitions).find((k) => !before.has(k))) != null ? _a : null;
      const newValue = {};
      for (const k of ["name", "description", "slotSettings", "preferredValues"]) {
        if (params[k] !== void 0)
          newValue[k] = params[k];
      }
      if (key && Object.keys(newValue).length)
        key = comp.editComponentProperty(key, newValue);
      if (params.name)
        slot.name = params.name;
      return __spreadProps(__spreadValues({ success: true }, nodeInfo(slot)), { propertyKey: key });
    },
    async reset_slot(params) {
      const node = await requireNode(params.nodeId);
      if (node.type !== "SLOT")
        throw new Error("Node is not a slot");
      node.resetSlot();
      return { success: true, limitViolations: node.limitViolations };
    },
    async set_property_reference(params) {
      const node = await requireNode(params.nodeId);
      node.componentPropertyReferences = params.references;
      return { success: true, nodeId: params.nodeId, references: params.references };
    },
    async get_component_properties(params) {
      const node = await requireNode(params.nodeId);
      if (!("componentPropertyDefinitions" in node))
        throw new Error("Node has no component properties");
      return node.componentPropertyDefinitions;
    },
    async combine_as_variants(params) {
      const components = [];
      for (const id of params.componentIds) {
        const node = await figma.getNodeByIdAsync(id);
        if (!node || node.type !== "COMPONENT")
          throw new Error(`Not a component: ${id}`);
        components.push(node);
      }
      const parent = params.parentId ? await figma.getNodeByIdAsync(params.parentId) : components[0].parent;
      const set = figma.combineAsVariants(components, parent);
      if (params.name)
        set.name = params.name;
      return { id: set.id, name: set.name, type: set.type, x: set.x, y: set.y, width: set.width, height: set.height };
    },
    async create_component_from_node(params) {
      const node = await requireNode(params.nodeId);
      const component2 = figma.createComponentFromNode(node);
      if (params.name)
        component2.name = params.name;
      return { id: component2.id, name: component2.name, type: component2.type };
    },
    async create_component(params) {
      var _a, _b, _c;
      const parent = await resolveParent(params.parentId);
      const comp = figma.createComponent();
      comp.name = (_a = params.name) != null ? _a : "Component";
      comp.resize((_b = params.width) != null ? _b : 100, (_c = params.height) != null ? _c : 100);
      if (params.x !== void 0)
        comp.x = params.x;
      if (params.y !== void 0)
        comp.y = params.y;
      if (parent)
        parent.appendChild(comp);
      return __spreadValues({ success: true }, nodeInfo(comp));
    },
    async set_instance_property(params) {
      const node = await requireNode(params.nodeId);
      if (node.type !== "INSTANCE")
        throw new Error("Node is not a component instance");
      node.setProperties(params.properties);
      return { success: true };
    },
    async get_instance_properties(params) {
      var _a, _b, _c, _d, _e;
      const node = await requireNode(params.nodeId);
      if (node.type !== "INSTANCE")
        throw new Error("Node is not a component instance");
      const mainComp = await node.getMainComponentAsync();
      const defsSource = ((_a = mainComp == null ? void 0 : mainComp.parent) == null ? void 0 : _a.type) === "COMPONENT_SET" ? mainComp.parent : mainComp;
      const defs = (_b = defsSource == null ? void 0 : defsSource.componentPropertyDefinitions) != null ? _b : {};
      const vals = (_c = node.componentProperties) != null ? _c : {};
      const result = {};
      for (const [key, def] of Object.entries(defs)) {
        result[key] = __spreadValues(__spreadValues({
          type: def.type,
          defaultValue: def.defaultValue,
          currentValue: (_e = (_d = vals[key]) == null ? void 0 : _d.value) != null ? _e : def.defaultValue
        }, def.variantOptions ? { options: def.variantOptions } : {}), def.preferredValues ? { preferredValues: def.preferredValues } : {});
      }
      return result;
    },
    async swap_instance(params) {
      const node = await requireNode(params.nodeId);
      if (node.type !== "INSTANCE")
        throw new Error("Node is not a component instance");
      const comp = await figma.getNodeByIdAsync(params.componentId);
      if (!comp || comp.type !== "COMPONENT")
        throw new Error(`Not a component: ${params.componentId}`);
      node.swapComponent(comp);
      return { success: true, nodeId: node.id, newComponentId: comp.id, newComponentName: comp.name };
    },
    async reset_instance(params) {
      const node = await requireNode(params.nodeId);
      if (node.type !== "INSTANCE")
        throw new Error("Node is not a component instance");
      node.removeOverrides();
      return { success: true };
    },
    async detach_instance(params) {
      const node = await requireNode(params.nodeId);
      if (node.type !== "INSTANCE")
        throw new Error("Node is not a component instance");
      const frame = node.detachInstance();
      return __spreadValues({ success: true }, nodeInfo(frame));
    }
  };
  Object.assign(componentsHandlers, {
    async set_component_meta(params) {
      const node = await requireNode(params.nodeId);
      if (node.type !== "COMPONENT" && node.type !== "COMPONENT_SET")
        throw new Error("Node is not a component");
      if (params.descriptionMarkdown !== void 0)
        node.descriptionMarkdown = params.descriptionMarkdown;
      else if (params.description !== void 0)
        node.description = params.description;
      if (params.documentationLinks !== void 0)
        node.documentationLinks = params.documentationLinks.map((uri) => ({ uri }));
      return { success: true, description: node.description, documentationLinks: node.documentationLinks };
    },
    async get_component_meta(params) {
      let node = await requireNode(params.nodeId);
      if (node.type === "INSTANCE")
        node = await node.getMainComponentAsync();
      if (!node || node.type !== "COMPONENT" && node.type !== "COMPONENT_SET")
        throw new Error("Not a component");
      return __spreadValues({
        id: node.id,
        key: node.key,
        name: node.name,
        type: node.type,
        remote: node.remote,
        description: node.description,
        descriptionMarkdown: node.descriptionMarkdown,
        documentationLinks: node.documentationLinks.map((l) => l.uri)
      }, node.type === "COMPONENT_SET" ? { variants: node.children.map((c) => ({ id: c.id, name: c.name })) } : {});
    },
    async expose_instance(params) {
      var _a;
      const node = await requireNode(params.nodeId);
      if (node.type !== "INSTANCE")
        throw new Error("Node is not an instance");
      node.isExposedInstance = (_a = params.exposed) != null ? _a : true;
      return { success: true, isExposedInstance: node.isExposedInstance };
    },
    async get_nested_instances(params) {
      const node = await requireNode(params.nodeId);
      if (node.type !== "INSTANCE")
        throw new Error("Node is not an instance");
      const list = params.exposedOnly ? node.exposedInstances : node.findAllWithCriteria({ types: ["INSTANCE"] });
      return Promise.all(list.map(async (n) => {
        const main = await n.getMainComponentAsync();
        let properties = {};
        try {
          for (const [k, p] of Object.entries(n.componentProperties))
            properties[k] = p.value;
        } catch (e) {
          properties = null;
        }
        return {
          id: n.id,
          name: n.name,
          exposed: n.isExposedInstance,
          component: main ? main.parent && main.parent.type === "COMPONENT_SET" ? main.parent.name : main.name : null,
          properties
        };
      }));
    },
    async get_instance_overrides(params) {
      const node = await requireNode(params.nodeId);
      if (node.type !== "INSTANCE")
        throw new Error("Node is not an instance");
      return Promise.all(node.overrides.map(async (o) => {
        const n = await figma.getNodeByIdAsync(o.id);
        return { id: o.id, name: n ? n.name : null, type: n ? n.type : null, fields: o.overriddenFields };
      }));
    }
  });

  // src/handlers/audit.js
  var auditHandlers = {
    async audit_contrast(params) {
      const toLinear = (c) => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
      const luminance = (c) => 0.2126 * toLinear(c.r) + 0.7152 * toLinear(c.g) + 0.0722 * toLinear(c.b);
      const contrast = (a, b) => {
        const hi = Math.max(luminance(a), luminance(b)), lo = Math.min(luminance(a), luminance(b));
        return (hi + 0.05) / (lo + 0.05);
      };
      const over = (top, a, base) => ({ r: top.r * a + base.r * (1 - a), g: top.g * a + base.g * (1 - a), b: top.b * a + base.b * (1 - a) });
      const rgb255 = (c) => ({ r: Math.round(c.r * 255), g: Math.round(c.g * 255), b: Math.round(c.b * 255) });
      function paintLayer(node) {
        var _a, _b;
        if (!("fills" in node) || !Array.isArray(node.fills))
          return null;
        let color = null;
        let alpha = 0;
        for (const f of node.fills) {
          if (f.visible === false)
            continue;
          const o = (_a = f.opacity) != null ? _a : 1;
          if (f.type === "IMAGE" || f.type === "VIDEO") {
            if (o >= 0.5)
              return { image: true };
            continue;
          }
          let c = null;
          let a = o;
          if (f.type === "SOLID")
            c = f.color;
          else if (f.type && f.type.startsWith("GRADIENT_") && ((_b = f.gradientStops) == null ? void 0 : _b.length)) {
            const st = f.gradientStops;
            c = { r: st.reduce((n, x) => n + x.color.r, 0) / st.length, g: st.reduce((n, x) => n + x.color.g, 0) / st.length, b: st.reduce((n, x) => n + x.color.b, 0) / st.length };
            a *= st.reduce((n, x) => {
              var _a2;
              return n + ((_a2 = x.color.a) != null ? _a2 : 1);
            }, 0) / st.length;
          }
          if (!c || a <= 0)
            continue;
          color = color ? over(c, a, color) : c;
          alpha = a + alpha * (1 - a);
        }
        if (!color)
          return null;
        return { color, alpha: alpha * ("opacity" in node ? node.opacity : 1) };
      }
      const contains = (b, p) => b && p.x >= b.x && p.x <= b.x + b.width && p.y >= b.y && p.y <= b.y + b.height;
      function seen(node, point) {
        for (let n = node; n && n.type !== "PAGE"; n = n.parent) {
          if (n.visible === false)
            return false;
          if ("opacity" in n && n.opacity === 0)
            return false;
          if (n !== node && n.clipsContent && !contains(n.absoluteBoundingBox, point))
            return false;
        }
        return true;
      }
      const opaque = (l) => l.image || l.alpha >= 0.99;
      function paintAt(node, point, out) {
        if (node.visible === false || node.type === "TEXT" || node.isMask || !contains(node.absoluteBoundingBox, point))
          return false;
        if ("children" in node) {
          for (let i = node.children.length - 1; i >= 0; i--)
            if (paintAt(node.children[i], point, out))
              return true;
        }
        const own = paintLayer(node);
        if (!own)
          return false;
        out.push(own);
        return opaque(own);
      }
      const parents = (node) => {
        const chain = [];
        for (let cur = node; cur.parent && cur.parent.type !== "PAGE" && cur.parent.type !== "DOCUMENT"; cur = cur.parent)
          chain.push(cur);
        return chain;
      };
      function coveredBy(node, point) {
        for (const cur of parents(node)) {
          const siblings = cur.parent.children;
          for (let i = siblings.indexOf(cur) + 1; i < siblings.length; i++) {
            if (paintAt(siblings[i], point, []))
              return siblings[i].name;
          }
        }
        return null;
      }
      function background(node, point) {
        const layers = [];
        for (const cur of parents(node)) {
          const parent = cur.parent;
          const siblings = parent.children;
          for (let i = siblings.indexOf(cur) - 1; i >= 0; i--) {
            if (paintAt(siblings[i], point, layers))
              return composite(layers);
          }
          const own = paintLayer(parent);
          if (own) {
            layers.push(own);
            if (opaque(own))
              return composite(layers);
          }
        }
        return composite(layers);
      }
      function composite(layers) {
        var _a;
        if (layers.some((l) => l.image))
          return { image: true };
        const page = (_a = figma.currentPage.backgrounds) == null ? void 0 : _a.find((b) => b.type === "SOLID");
        let color = page ? page.color : { r: 1, g: 1, b: 1 };
        for (let i = layers.length - 1; i >= 0; i--)
          color = over(layers[i].color, layers[i].alpha, color);
        return { color };
      }
      function textColors(node) {
        var _a;
        const ranges = Array.isArray(node.fills) ? [{ fills: node.fills, characters: node.characters }] : node.getStyledTextSegments(["fills"]);
        const out = [];
        for (const seg of ranges) {
          const solid = [...seg.fills].reverse().find((f) => f.type === "SOLID" && f.visible !== false);
          if (solid)
            out.push({ color: solid.color, alpha: ((_a = solid.opacity) != null ? _a : 1) * node.opacity, characters: seg.characters });
        }
        return out;
      }
      const scopeNode = await resolveScope(params.scopeId);
      const textNodes = scopeNode.findAllWithCriteria({ types: ["TEXT"] });
      const issues = [];
      for (const node of textNodes) {
        if (!node.characters.trim())
          continue;
        const b = node.absoluteBoundingBox;
        if (!b)
          continue;
        const point = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
        if (!seen(node, point))
          continue;
        const colors = textColors(node).filter((c) => c.alpha > 0);
        if (!colors.length)
          continue;
        const cover = coveredBy(node, point);
        const size = typeof node.fontSize === "number" ? node.fontSize : 12;
        const bold = typeof node.fontWeight === "number" && node.fontWeight >= 700;
        const isLarge = size >= 24 || size >= 18.66 && bold;
        const required = isLarge ? 3 : 4.5;
        const base = { id: node.id, name: node.name, text: node.characters.slice(0, 60), fontSize: size, bold, required };
        if (cover) {
          issues.push(__spreadProps(__spreadValues({}, base), { ratio: null, needsReview: true, reason: `hidden under "${cover}" \u2014 not visible; probably leftover` }));
          continue;
        }
        const bg = background(node, point);
        if (bg.image) {
          issues.push(__spreadProps(__spreadValues({}, base), { ratio: null, needsReview: true, reason: "text over an image \u2014 check by eye" }));
          continue;
        }
        let worst = null;
        for (const c of colors) {
          const shown = over(c.color, c.alpha, bg.color);
          const ratio = contrast(shown, bg.color);
          if (!worst || ratio < worst.ratio)
            worst = { ratio, text: shown, segment: c.characters };
        }
        if (worst.ratio < required) {
          issues.push(__spreadValues(__spreadProps(__spreadValues({}, base), {
            ratio: Math.round(worst.ratio * 100) / 100,
            textColor: rgb255(worst.text),
            bgColor: rgb255(bg.color)
          }), colors.length > 1 ? { worstRange: worst.segment.slice(0, 40) } : {}));
        }
      }
      return issues;
    },
    async audit_missing_components(params) {
      const scopeNode = await resolveScope(params.scopeId);
      const instances = scopeNode.findAllWithCriteria({ types: ["INSTANCE"] });
      const withMain = await Promise.all(instances.map(async (n) => ({ n, mc: await n.getMainComponentAsync() })));
      return withMain.filter(({ mc }) => !mc).map(({ n }) => {
        var _a, _b;
        return { id: n.id, name: n.name, x: n.x, y: n.y, parentId: (_a = n.parent) == null ? void 0 : _a.id, parentName: (_b = n.parent) == null ? void 0 : _b.name };
      });
    },
    async audit_hardcoded_colors(params) {
      var _a, _b;
      const scopeNode = await resolveScope(params.scopeId);
      const nodes = scopeNode.findAll((n) => "fills" in n || "strokes" in n);
      const issues = [];
      for (const n of nodes) {
        const hardcodedFills = [];
        const hardcodedStrokes = [];
        if ("fills" in n && Array.isArray(n.fills)) {
          for (const f of n.fills) {
            if (f.type === "SOLID" && f.visible !== false && !((_a = f.boundVariables) == null ? void 0 : _a.color)) {
              hardcodedFills.push({ r: Math.round(f.color.r * 255), g: Math.round(f.color.g * 255), b: Math.round(f.color.b * 255) });
            }
          }
        }
        if ("strokes" in n && Array.isArray(n.strokes)) {
          for (const s of n.strokes) {
            if (s.type === "SOLID" && s.visible !== false && !((_b = s.boundVariables) == null ? void 0 : _b.color)) {
              hardcodedStrokes.push({ r: Math.round(s.color.r * 255), g: Math.round(s.color.g * 255), b: Math.round(s.color.b * 255) });
            }
          }
        }
        if (hardcodedFills.length || hardcodedStrokes.length) {
          issues.push({ id: n.id, name: n.name, type: n.type, hardcodedFills, hardcodedStrokes });
        }
      }
      return issues;
    },
    async audit_detached_styles(params) {
      const scopeNode = await resolveScope(params.scopeId);
      const texts = scopeNode.findAllWithCriteria({ types: ["TEXT"] });
      return texts.filter((n) => !n.textStyleId).map((n) => {
        var _a;
        return {
          id: n.id,
          name: n.name,
          text: (_a = n.characters) == null ? void 0 : _a.slice(0, 60),
          fontSize: typeof n.fontSize === "number" ? n.fontSize : null,
          fontFamily: typeof n.fontName === "object" && !("mixed" in n.fontName) ? n.fontName.family : null
        };
      });
    },
    async audit_empty_frames(params) {
      const scopeNode = await resolveScope(params.scopeId);
      const frames = scopeNode.findAllWithCriteria({ types: ["FRAME"] });
      return frames.filter((n) => n.children.length === 0 || n.children.every((c) => c.visible === false)).map((n) => {
        var _a;
        return { id: n.id, name: n.name, x: n.x, y: n.y, width: n.width, height: n.height, parentId: (_a = n.parent) == null ? void 0 : _a.id };
      });
    },
    async audit_all(params, dispatch2) {
      var _a;
      const scopeId = (_a = params.scopeId) != null ? _a : null;
      const run = async (action) => {
        try {
          return await dispatch2(action, { scopeId });
        } catch (e) {
          return { error: errorMessage(e) };
        }
      };
      const [missingComponents, hardcodedColors, detachedStyles, emptyFrames, contrastIssues] = await Promise.all([
        run("audit_missing_components"),
        run("audit_hardcoded_colors"),
        run("audit_detached_styles"),
        run("audit_empty_frames"),
        run("audit_contrast")
      ]);
      return { missingComponents, hardcodedColors, detachedStyles, emptyFrames, contrastIssues };
    }
  };

  // src/handlers/styles.js
  var common = (s) => __spreadValues(__spreadValues(__spreadValues({
    id: s.id,
    key: s.key,
    name: s.name
  }, s.description ? { description: s.description } : {}), s.remote ? { remote: true } : {}), s.boundVariables && Object.keys(s.boundVariables).length ? { boundVariables: s.boundVariables } : {});
  var stylesHandlers = {
    async create_text_style(params) {
      const fontName = { family: params.fontFamily, style: params.fontStyle };
      if (params.variationSettings)
        fontName.variationSettings = params.variationSettings;
      await loadFont(fontName);
      const style = figma.createTextStyle();
      style.name = params.name;
      style.fontName = fontName;
      applyTextProps(style, params);
      if (params.description !== void 0)
        style.description = params.description;
      return { id: style.id, name: style.name };
    },
    async get_local_styles(params = {}) {
      const want = (t) => !params.type || params.type === t;
      const result = {};
      if (want("paint")) {
        result.paint = (await figma.getLocalPaintStylesAsync()).map((s) => __spreadProps(__spreadValues({}, common(s)), { paints: s.paints.map(describePaint) }));
      }
      if (want("text")) {
        result.text = (await figma.getLocalTextStylesAsync()).map((s) => __spreadProps(__spreadValues(__spreadProps(__spreadValues({}, common(s)), {
          fontFamily: s.fontName.family,
          fontStyle: s.fontName.style
        }), s.fontName.variationSettings ? { variationSettings: s.fontName.variationSettings } : {}), {
          fontSize: s.fontSize,
          lineHeight: s.lineHeight,
          letterSpacing: s.letterSpacing,
          paragraphSpacing: s.paragraphSpacing,
          paragraphIndent: s.paragraphIndent,
          textCase: s.textCase,
          textDecoration: s.textDecoration,
          leadingTrim: s.leadingTrim,
          textWrapStyle: s.textWrapStyle
        }));
      }
      if (want("effect")) {
        result.effect = (await figma.getLocalEffectStylesAsync()).map((s) => __spreadProps(__spreadValues({}, common(s)), { effects: JSON.parse(JSON.stringify(s.effects)) }));
      }
      if (want("grid")) {
        result.grid = (await figma.getLocalGridStylesAsync()).map((s) => __spreadProps(__spreadValues({}, common(s)), { layoutGrids: s.layoutGrids.map(describeGrid) }));
      }
      return result;
    },
    async update_style(params) {
      var _a, _b;
      const style = await figma.getStyleByIdAsync(params.styleId);
      if (!style)
        throw new Error(`Style not found: ${params.styleId}`);
      if (style.remote)
        throw new Error("Library styles are read-only \u2014 edit them in the library file");
      if (params.name !== void 0)
        style.name = params.name;
      if (params.description !== void 0)
        style.description = params.description;
      if (style.type === "PAINT") {
        if (params.paints)
          style.paints = params.paints.map(normalizePaint);
        else if (params.color !== void 0)
          style.paints = [solidPaint(params.color, params.opacity)];
      } else if (style.type === "TEXT") {
        await loadFont(style.fontName);
        if (params.fontFamily !== void 0 || params.fontStyle !== void 0 || params.variationSettings !== void 0) {
          const font = { family: (_a = params.fontFamily) != null ? _a : style.fontName.family, style: (_b = params.fontStyle) != null ? _b : params.fontFamily ? "Regular" : style.fontName.style };
          if (params.variationSettings)
            font.variationSettings = params.variationSettings;
          await loadFont(font);
          style.fontName = font;
        }
        applyTextProps(style, params);
      } else if (style.type === "EFFECT") {
        if (params.effects)
          style.effects = params.effects.map(normalizeEffect);
      } else if (style.type === "GRID") {
        if (params.layoutGrids)
          style.layoutGrids = params.layoutGrids.map(normalizeGrid);
      }
      return { success: true, id: style.id, name: style.name, type: style.type };
    },
    async get_style_consumers(params) {
      var _a;
      const style = await figma.getStyleByIdAsync(params.styleId);
      if (!style)
        throw new Error(`Style not found: ${params.styleId}`);
      await figma.loadAllPagesAsync();
      const consumers = await style.getStyleConsumersAsync();
      const limit = (_a = params.limit) != null ? _a : 200;
      return {
        styleId: style.id,
        name: style.name,
        count: consumers.length,
        consumers: consumers.slice(0, limit).map((c) => __spreadProps(__spreadValues({}, nodeInfo(c.node)), { fields: c.fields, page: pageOf(c.node) }))
      };
    },
    create_grid_style(params) {
      var _a;
      const style = figma.createGridStyle();
      style.name = params.name;
      style.layoutGrids = ((_a = params.layoutGrids) != null ? _a : []).map(normalizeGrid);
      if (params.description !== void 0)
        style.description = params.description;
      return { id: style.id, name: style.name };
    },
    async apply_grid_style(params) {
      const node = await requireNode(params.nodeId);
      if (!("gridStyleId" in node))
        throw new Error("Node does not support layout grids");
      await node.setGridStyleIdAsync(params.styleId);
      return { success: true };
    },
    async apply_text_style(params) {
      const node = await requireNode(params.nodeId);
      if (node.type !== "TEXT")
        throw new Error("Node is not a text layer");
      await node.setTextStyleIdAsync(params.styleId);
      return { success: true };
    },
    async apply_paint_style(params) {
      var _a;
      const node = await requireNode(params.nodeId);
      const target = (_a = params.target) != null ? _a : "fills";
      if (target === "fills") {
        if (!("fillStyleId" in node))
          throw new Error("Node does not support fill styles");
        await node.setFillStyleIdAsync(params.styleId);
      } else {
        if (!("strokeStyleId" in node))
          throw new Error("Node does not support stroke styles");
        await node.setStrokeStyleIdAsync(params.styleId);
      }
      return { success: true };
    },
    async apply_effect_style(params) {
      const node = await requireNode(params.nodeId);
      if (!("effectStyleId" in node))
        throw new Error("Node does not support effect styles");
      await node.setEffectStyleIdAsync(params.styleId);
      return { success: true };
    },
    async delete_style(params) {
      const style = await figma.getStyleByIdAsync(params.styleId);
      if (!style)
        throw new Error(`Style not found: ${params.styleId}`);
      style.remove();
      return { success: true };
    },
    create_paint_style(params) {
      const style = figma.createPaintStyle();
      style.name = params.name;
      if (params.description !== void 0)
        style.description = params.description;
      style.paints = params.paints ? params.paints.map(normalizePaint) : [solidPaint(params.color, params.opacity)];
      return { id: style.id, name: style.name };
    },
    create_effect_style(params) {
      const style = figma.createEffectStyle();
      style.name = params.name;
      if (params.description !== void 0)
        style.description = params.description;
      if (params.effects)
        style.effects = params.effects.map(normalizeEffect);
      return { id: style.id, name: style.name };
    }
  };

  // src/handlers/structure.js
  async function moveWithFonts(nodes, move, what = "move it") {
    const missing = /* @__PURE__ */ new Set();
    for (const n of nodes)
      for (const f of await loadSubtreeFonts(n))
        missing.add(f);
    try {
      return move();
    } catch (e) {
      if (missing.size) {
        throw new Error(`Can't ${what}: these fonts aren't available on this machine \u2014 ${[...missing].join(", ")}. Install them, or move it in Figma by hand`);
      }
      throw e;
    }
  }
  function resolveRefs(value, scope) {
    if (Array.isArray(value))
      return value.map((v) => resolveRefs(v, scope));
    if (value && typeof value === "object") {
      if (typeof value.$ref === "string")
        return lookupRef(value.$ref, scope);
      const out = {};
      for (const [k, v] of Object.entries(value))
        out[k] = resolveRefs(v, scope);
      return out;
    }
    return value;
  }
  function lookupRef(ref, scope) {
    const parts = ref.split(".");
    const key = parts[0];
    if (!(key in scope))
      throw new Error(`batch ref "${ref}": no earlier command "${key}"`);
    let cur = scope[key];
    for (let i = 1; i < parts.length; i++) {
      if (cur == null)
        throw new Error(`batch ref "${ref}": "${parts.slice(0, i).join(".")}" is null`);
      cur = cur[parts[i]];
    }
    if (cur === void 0)
      throw new Error(`batch ref "${ref}": resolved to undefined`);
    return cur;
  }
  var structureHandlers = {
    async reparent(params) {
      const node = await requireNode(params.nodeId);
      const newParent = await figma.getNodeByIdAsync(params.newParentId);
      if (!newParent)
        throw new Error(`New parent not found: ${params.newParentId}`);
      if (!("appendChild" in newParent))
        throw new Error("New parent cannot have children");
      await moveWithFonts([node], () => newParent.appendChild(node), `move "${node.name}" into "${newParent.name}"`);
      return { success: true, newParentId: newParent.id, x: "x" in node ? node.x : null, y: "y" in node ? node.y : null };
    },
    async batch(params, dispatch2) {
      const results = [];
      const scope = {};
      const run = runState.current;
      if (run && !run.results)
        run.results = results;
      let i = 0;
      let lastYield = Date.now();
      for (const sub of params.commands) {
        if (Date.now() - lastYield > 50) {
          await new Promise((resolve) => setTimeout(resolve, 0));
          lastYield = Date.now();
        }
        if (run && run.aborted)
          break;
        let result;
        try {
          const resolved = resolveRefs(sub, scope);
          if (run) {
            run.step = i;
            run.stepAction = resolved.action;
          }
          figma.ui.postMessage({ type: "progress", step: i, action: resolved.action });
          result = await dispatch2(resolved.action, resolved);
        } catch (e) {
          result = { error: errorMessage(e) };
        }
        results.push(result);
        scope[String(i)] = result;
        if (sub.as)
          scope[sub.as] = result;
        i++;
      }
      return results;
    },
    async delete_node(params) {
      const node = await requireNode(params.nodeId);
      node.remove();
      return { success: true };
    },
    async reorder(params) {
      const node = await requireNode(params.nodeId);
      const parent = node.parent;
      if (!parent || !("insertChild" in parent))
        throw new Error("Node has no reorderable parent");
      await moveWithFonts([node], () => parent.insertChild(params.index, node), `reorder "${node.name}"`);
      return { success: true, index: params.index };
    },
    async bring_to_front(params) {
      const node = await requireNode(params.nodeId);
      const parent = node.parent;
      if (!parent || !("insertChild" in parent))
        throw new Error("Node has no reorderable parent");
      await moveWithFonts([node], () => parent.appendChild(node), `bring "${node.name}" to front`);
      return { success: true };
    },
    async send_to_back(params) {
      const node = await requireNode(params.nodeId);
      const parent = node.parent;
      if (!parent || !("insertChild" in parent))
        throw new Error("Node has no reorderable parent");
      await moveWithFonts([node], () => parent.insertChild(0, node), `send "${node.name}" to back`);
      return { success: true };
    },
    async group(params) {
      const nodes = await Promise.all(params.nodeIds.map((id) => figma.getNodeByIdAsync(id)));
      const valid = nodes.filter(Boolean);
      if (valid.length === 0)
        throw new Error("No valid nodes to group");
      const parent = params.parentId ? await figma.getNodeByIdAsync(params.parentId) : valid[0].parent;
      const group = await moveWithFonts(valid, () => figma.group(valid, parent), "group these layers");
      if (params.name)
        group.name = params.name;
      return __spreadValues({ success: true }, nodeInfo(group));
    },
    async ungroup(params) {
      const node = await requireNode(params.nodeId);
      if (node.type !== "GROUP")
        throw new Error("Node is not a group");
      const children = [...node.children].map(nodeInfo);
      figma.ungroup(node);
      return { success: true, children };
    },
    async create_section(params) {
      var _a;
      const parent = await resolveParent(params.parentId);
      const section = figma.createSection();
      section.name = (_a = params.name) != null ? _a : "Section";
      if (params.x !== void 0)
        section.x = params.x;
      if (params.y !== void 0)
        section.y = params.y;
      if (params.width !== void 0 && params.height !== void 0) {
        section.resizeWithoutConstraints(params.width, params.height);
      }
      if (parent)
        parent.appendChild(section);
      return __spreadValues({ success: true }, nodeInfo(section));
    },
    async resize_section_to_fit(params) {
      var _a;
      const section = await requireNode(params.nodeId);
      if (section.type !== "SECTION")
        throw new Error("Node is not a section");
      const pad = (_a = params.padding) != null ? _a : 100;
      const children = section.children;
      if (!children.length)
        throw new Error("Section has no children");
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const c of children) {
        minX = Math.min(minX, c.x);
        minY = Math.min(minY, c.y);
        maxX = Math.max(maxX, c.x + c.width);
        maxY = Math.max(maxY, c.y + c.height);
      }
      const dx = pad - minX, dy = pad - minY;
      for (const c of children) {
        c.x += dx;
        c.y += dy;
      }
      section.x -= dx;
      section.y -= dy;
      section.resizeWithoutConstraints(maxX - minX + pad * 2, maxY - minY + pad * 2);
      return __spreadValues({ success: true }, nodeInfo(section));
    },
    async scroll_to_node(params) {
      const node = await requireNode(params.nodeId);
      const page = pageNodeOf(node);
      if (page && page !== figma.currentPage)
        await figma.setCurrentPageAsync(page);
      figma.viewport.scrollAndZoomIntoView([node]);
      return { success: true, page: page ? page.name : null };
    },
    async set_selection(params) {
      const nodes = (await Promise.all(params.nodeIds.map((id) => figma.getNodeByIdAsync(id)))).filter(Boolean);
      const page = nodes.length ? pageNodeOf(nodes[0]) : figma.currentPage;
      if (page && page !== figma.currentPage)
        await figma.setCurrentPageAsync(page);
      const valid = nodes.filter((n) => pageNodeOf(n) === page);
      figma.currentPage.selection = valid;
      const skipped = nodes.filter((n) => !valid.includes(n)).map((n) => n.id);
      return __spreadValues({ success: true, selected: valid.map((n) => n.id) }, skipped.length ? { skipped } : {});
    },
    noop(params) {
      var _a;
      return (_a = params.result) != null ? _a : { skipped: true };
    },
    notify(params) {
      var _a;
      figma.notify(params.message, { error: (_a = params.error) != null ? _a : false });
      return { success: true };
    },
    async get_pages() {
      await figma.loadAllPagesAsync();
      return figma.root.children.map((p) => ({
        id: p.id,
        name: p.name,
        isCurrent: p.id === figma.currentPage.id
      }));
    },
    async switch_page(params) {
      const page = await figma.getNodeByIdAsync(params.pageId);
      if (!page || page.type !== "PAGE")
        throw new Error(`Page not found: ${params.pageId}`);
      await figma.setCurrentPageAsync(page);
      return { success: true, pageId: page.id, pageName: page.name };
    },
    async create_page(params) {
      var _a;
      const page = figma.createPage();
      page.name = (_a = params.name) != null ? _a : "Page";
      if (params.index !== void 0) {
        await figma.loadAllPagesAsync();
        figma.root.insertChild(params.index, page);
      }
      return { id: page.id, name: page.name };
    },
    async delete_page(params) {
      await figma.loadAllPagesAsync();
      if (figma.root.children.length <= 1)
        throw new Error("Cannot delete the only page");
      const page = figma.root.children.find((p) => p.id === params.pageId);
      if (!page)
        throw new Error(`Page not found: ${params.pageId}`);
      page.remove();
      return { success: true };
    },
    async rename_page(params) {
      const page = await figma.getNodeByIdAsync(params.pageId);
      if (!page || page.type !== "PAGE")
        throw new Error(`Page not found: ${params.pageId}`);
      page.name = params.name;
      return { success: true, pageId: page.id, name: page.name };
    }
  };

  // src/handlers/library.js
  var IMPORT_TIMEOUT = 2e4;
  async function withTimeout(promise, what) {
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(
        `${what} timed out after ${IMPORT_TIMEOUT / 1e3}s \u2014 the library is probably not published or not available to this file. For components the file already uses, call create_instance with the id from get_library_assets.`
      )), IMPORT_TIMEOUT);
    });
    try {
      return await Promise.race([promise, timeout]);
    } finally {
      clearTimeout(timer);
    }
  }
  var STYLE_FIELDS = ["fillStyleId", "strokeStyleId", "effectStyleId", "textStyleId", "gridStyleId"];
  function styleInfo(s) {
    return { id: s.id, key: s.key, name: s.name, type: s.type, remote: s.remote, description: s.description || void 0 };
  }
  var libraryHandlers = {
    async get_library_variables(params) {
      if (!figma.teamLibrary)
        throw new Error('teamLibrary is unavailable \u2014 add "permissions": ["teamlibrary"] to manifest.json');
      if (params.collectionKey) {
        const vars = await figma.teamLibrary.getVariablesInLibraryCollectionAsync(params.collectionKey);
        return vars.map((v) => ({ name: v.name, key: v.key, type: v.resolvedType }));
      }
      const cols = await figma.teamLibrary.getAvailableLibraryVariableCollectionsAsync();
      return cols.map((c) => ({ name: c.name, key: c.key, libraryName: c.libraryName }));
    },
    async import_variable(params) {
      const v = await withTimeout(figma.variables.importVariableByKeyAsync(params.key), "Variable import");
      return { id: v.id, key: v.key, name: v.name, type: v.resolvedType, collectionId: v.variableCollectionId };
    },
    async import_component(params) {
      let comp;
      if (params.type === "COMPONENT_SET") {
        comp = await withTimeout(figma.importComponentSetByKeyAsync(params.key), "Component set import");
      } else {
        try {
          comp = await withTimeout(figma.importComponentByKeyAsync(params.key), "Component import");
        } catch (e) {
          if (errorMessage(e).includes("timed out"))
            throw e;
          comp = await withTimeout(figma.importComponentSetByKeyAsync(params.key), "Component set import");
        }
      }
      const out = { id: comp.id, key: comp.key, name: comp.name, type: comp.type };
      if (params.parentId || params.instance) {
        const parent = await resolveParent(params.parentId);
        const main = comp.type === "COMPONENT_SET" ? comp.defaultVariant : comp;
        const inst = main.createInstance();
        if (parent)
          parent.appendChild(inst);
        if (params.x !== void 0)
          inst.x = params.x;
        if (params.y !== void 0)
          inst.y = params.y;
        out.instance = nodeInfo(inst);
      }
      return out;
    },
    async import_style(params) {
      return styleInfo(await withTimeout(figma.importStyleByKeyAsync(params.key), "Style import"));
    },
    async get_library_assets(params) {
      var _a, _b;
      const roots = await scopeRoots({ allPages: (_a = params.allPages) != null ? _a : !params.scopeId, scopeId: params.scopeId });
      const comps = /* @__PURE__ */ new Map();
      const styleIds = /* @__PURE__ */ new Set();
      const varIds = /* @__PURE__ */ new Set();
      const collectVars = (bv) => {
        for (const b of Object.values(bv || {})) {
          for (const a of Array.isArray(b) ? b : [b])
            if (a && a.id)
              varIds.add(a.id);
        }
      };
      for (const root of roots) {
        const nodes = "findAll" in root ? root.findAll() : [];
        for (const n of nodes) {
          if (n.type === "INSTANCE") {
            const main = await n.getMainComponentAsync();
            if (main) {
              const set = main.parent && main.parent.type === "COMPONENT_SET" ? main.parent : null;
              const id = set ? set.id : main.id;
              const entry = (_b = comps.get(id)) != null ? _b : {
                id,
                key: set ? set.key : main.key,
                name: set ? set.name : main.name,
                type: set ? "COMPONENT_SET" : "COMPONENT",
                remote: main.remote,
                uses: 0
              };
              entry.uses++;
              comps.set(id, entry);
            }
          }
          for (const f of STYLE_FIELDS) {
            if (f in n && typeof n[f] === "string" && n[f])
              styleIds.add(n[f]);
          }
          if ("boundVariables" in n)
            collectVars(n.boundVariables);
          for (const prop of ["fills", "strokes"]) {
            if (prop in n && Array.isArray(n[prop]))
              for (const p of n[prop])
                collectVars(p.boundVariables);
          }
        }
      }
      const keep = (x) => params.includeLocal || x.remote;
      const styles = [];
      for (const id of styleIds) {
        const s = await figma.getStyleByIdAsync(id);
        if (s && keep(s))
          styles.push(styleInfo(s));
      }
      const variables = [];
      for (const id of varIds) {
        const v = await figma.variables.getVariableByIdAsync(id);
        if (v && keep(v))
          variables.push({ id: v.id, key: v.key, name: v.name, type: v.resolvedType, remote: v.remote });
      }
      return { components: [...comps.values()].filter(keep), styles, variables };
    },
    async get_component_key(params) {
      let node = await requireNode(params.nodeId);
      if (node.type === "INSTANCE")
        node = await node.getMainComponentAsync();
      if (!node || node.type !== "COMPONENT" && node.type !== "COMPONENT_SET")
        throw new Error("Not a component");
      const set = node.type === "COMPONENT" && node.parent && node.parent.type === "COMPONENT_SET" ? node.parent : null;
      return __spreadValues({
        id: node.id,
        key: node.key,
        name: node.name,
        type: node.type,
        remote: node.remote
      }, set ? { componentSet: { id: set.id, key: set.key, name: set.name } } : {});
    }
  };

  // src/handlers/index.js
  var handlers = __spreadValues(__spreadValues(__spreadValues(__spreadValues(__spreadValues(__spreadValues(__spreadValues(__spreadValues(__spreadValues({}, readHandlers), editHandlers), createHandlers), variablesHandlers), componentsHandlers), auditHandlers), stylesHandlers), structureHandlers), libraryHandlers);

  // src/code.js
  figma.showUI(__html__, { width: 192, height: 130 });
  var fileInfo = () => ({ fileName: figma.root.name, pageName: figma.currentPage.name });
  figma.ui.postMessage(__spreadValues({ type: "hello" }, fileInfo()));
  var reportActivity = () => figma.ui.postMessage(__spreadValues({ type: "activity" }, fileInfo()));
  figma.on("selectionchange", reportActivity);
  figma.on("currentpagechange", reportActivity);
  var KEY = "bridgePairingKey";
  figma.clientStorage.getAsync(KEY).then(
    (key) => figma.ui.postMessage({ type: "key", key: key != null ? key : null }),
    () => figma.ui.postMessage({ type: "key", key: null })
  );
  async function dispatch(action, params) {
    const handler = handlers[action];
    if (!handler)
      throw new Error(`Unknown action: ${action}`);
    return handler(params, dispatch);
  }
  var queue = Promise.resolve();
  figma.ui.onmessage = (msg) => {
    if (msg && msg.__bridge === "save-key") {
      figma.clientStorage.setAsync(KEY, msg.key).catch(() => {
      });
      return;
    }
    queue = queue.then(() => runCommand(msg));
  };
  async function runCommand(msg) {
    const _a = msg, { id, action, _timeoutMs } = _a, params = __objRest(_a, ["id", "action", "_timeoutMs"]);
    const run = { action, step: null, stepAction: null, aborted: false, results: null };
    runState.current = run;
    const limit = Math.max(1e3, (Number(_timeoutMs) || 6e4) - 1500);
    let timer;
    const watchdog = new Promise((_, reject) => {
      timer = setTimeout(() => {
        run.aborted = true;
        const where = run.stepAction ? `batch step ${run.step} (${run.stepAction})` : action;
        reject(new Error(`Figma didn't finish ${where} within ${limit} ms \u2014 the plugin moved on; later batch steps were not run`));
      }, limit);
    });
    let result;
    try {
      result = await Promise.race([dispatch(action, params), watchdog]);
    } catch (e) {
      result = { error: errorMessage(e) };
      if (run.aborted && run.results)
        result = __spreadProps(__spreadValues({}, result), { stoppedAtStep: run.step, completed: run.results.slice() });
    } finally {
      clearTimeout(timer);
      if (runState.current === run)
        runState.current = null;
    }
    figma.commitUndo();
    try {
      figma.ui.postMessage({ id, result });
    } catch (e) {
      try {
        const plain = JSON.parse(JSON.stringify(result != null ? result : null, (k, v) => typeof v === "symbol" ? "mixed" : v));
        figma.ui.postMessage({ id, result: plain });
      } catch (e2) {
        figma.ui.postMessage({ id, result: { error: `Result could not be sent: ${errorMessage(e)}` } });
      }
    }
  }
})();
