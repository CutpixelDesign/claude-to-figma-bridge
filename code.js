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
  var __async = (__this, __arguments, generator) => {
    return new Promise((resolve, reject) => {
      var fulfilled = (value) => {
        try {
          step(generator.next(value));
        } catch (e) {
          reject(e);
        }
      };
      var rejected = (value) => {
        try {
          step(generator.throw(value));
        } catch (e) {
          reject(e);
        }
      };
      var step = (x) => x.done ? resolve(x.value) : Promise.resolve(x.value).then(fulfilled, rejected);
      step((generator = generator.apply(__this, __arguments)).next());
    });
  };

  // src/code.js
  figma.showUI(__html__, { width: 300, height: 160 });
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
  function buildTree(n, depth) {
    return __async(this, null, function* () {
      const obj = nodeInfo(n);
      if (depth > 0 && "children" in n) {
        obj.children = [];
        for (const c of n.children) {
          obj.children.push(yield buildTree(c, depth - 1));
        }
      }
      return obj;
    });
  }
  function executeAction(action, params) {
    return __async(this, null, function* () {
      var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, _m, _n, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z, _A, _B, _C, _D, _E, _F, _G, _H, _I, _J, _K, _L, _M, _N, _O, _P, _Q, _R, _S, _T, _U, _V;
      switch (action) {
        case "get_selection":
          return figma.currentPage.selection.map(nodeInfo);
        case "get_node": {
          const node = yield figma.getNodeByIdAsync(params.nodeId);
          if (!node)
            throw new Error(`Node not found: ${params.nodeId}`);
          return __spreadProps(__spreadValues({}, nodeInfo(node)), { visible: node.visible });
        }
        case "get_parent": {
          const node = yield figma.getNodeByIdAsync(params.nodeId);
          if (!node)
            throw new Error(`Node not found: ${params.nodeId}`);
          const chain = [];
          let cur = node.parent;
          while (cur && cur.type !== "PAGE" && cur.type !== "DOCUMENT") {
            chain.push(nodeInfo(cur));
            cur = cur.parent;
          }
          return chain;
        }
        case "get_tree": {
          const node = yield figma.getNodeByIdAsync(params.nodeId);
          if (!node)
            throw new Error(`Node not found: ${params.nodeId}`);
          return buildTree(node, (_a = params.depth) != null ? _a : 2);
        }
        case "get_page_tree":
          return buildTree(figma.currentPage, (_b = params.depth) != null ? _b : 1);
        case "get_page_nodes":
          return figma.currentPage.children.map((n) => ({
            id: n.id,
            name: n.name,
            type: n.type
          }));
        case "get_children": {
          const node = yield figma.getNodeByIdAsync(params.nodeId);
          if (!node)
            throw new Error(`Node not found: ${params.nodeId}`);
          if (!("children" in node))
            throw new Error("Node has no children");
          return node.children.map(nodeInfo);
        }
        case "get_text": {
          const node = yield figma.getNodeByIdAsync(params.nodeId);
          if (!node)
            throw new Error(`Node not found: ${params.nodeId}`);
          if (node.type !== "TEXT")
            throw new Error("Node is not a text layer");
          return { text: node.characters };
        }
        case "get_text_style": {
          const node = yield figma.getNodeByIdAsync(params.nodeId);
          if (!node)
            throw new Error(`Node not found: ${params.nodeId}`);
          if (node.type !== "TEXT")
            throw new Error("Node is not a text layer");
          const seg = node.getStyledTextSegments(["fontName", "fontSize", "fontWeight", "lineHeight", "letterSpacing", "textDecoration", "textCase"]);
          const first = seg[0] || {};
          return {
            fontFamily: (_d = (_c = first.fontName) == null ? void 0 : _c.family) != null ? _d : null,
            fontStyle: (_f = (_e = first.fontName) == null ? void 0 : _e.style) != null ? _f : null,
            fontSize: (_g = first.fontSize) != null ? _g : null,
            lineHeight: (_h = first.lineHeight) != null ? _h : null,
            letterSpacing: (_i = first.letterSpacing) != null ? _i : null,
            textDecoration: (_j = first.textDecoration) != null ? _j : null,
            textCase: (_k = first.textCase) != null ? _k : null,
            characters: node.characters
          };
        }
        case "create_text_style": {
          yield figma.loadFontAsync({ family: params.fontFamily, style: params.fontStyle });
          const style = figma.createTextStyle();
          style.name = params.name;
          style.fontName = { family: params.fontFamily, style: params.fontStyle };
          style.fontSize = params.fontSize;
          if (params.lineHeight !== void 0)
            style.lineHeight = params.lineHeight;
          if (params.letterSpacing !== void 0)
            style.letterSpacing = params.letterSpacing;
          return { id: style.id, name: style.name };
        }
        case "rename": {
          const node = yield figma.getNodeByIdAsync(params.nodeId);
          if (!node)
            throw new Error(`Node not found: ${params.nodeId}`);
          const oldName = node.name;
          node.name = params.name;
          return { success: true, oldName, newName: node.name };
        }
        case "move": {
          const node = yield figma.getNodeByIdAsync(params.nodeId);
          if (!node)
            throw new Error(`Node not found: ${params.nodeId}`);
          if (!("x" in node))
            throw new Error("Node is not positionable");
          if (params.x !== void 0)
            node.x = params.x;
          if (params.y !== void 0)
            node.y = params.y;
          return { success: true, x: node.x, y: node.y };
        }
        case "move_by": {
          const node = yield figma.getNodeByIdAsync(params.nodeId);
          if (!node)
            throw new Error(`Node not found: ${params.nodeId}`);
          if (!("x" in node))
            throw new Error("Node is not positionable");
          node.x += (_l = params.dx) != null ? _l : 0;
          node.y += (_m = params.dy) != null ? _m : 0;
          return { success: true, x: node.x, y: node.y };
        }
        case "resize": {
          const node = yield figma.getNodeByIdAsync(params.nodeId);
          if (!node)
            throw new Error(`Node not found: ${params.nodeId}`);
          const w = (_n = params.width) != null ? _n : node.width;
          const h = (_o = params.height) != null ? _o : node.height;
          if ("resizeWithoutConstraints" in node) {
            node.resizeWithoutConstraints(w, h);
          } else if ("resize" in node) {
            node.resize(w, h);
          } else {
            throw new Error("Node is not resizable");
          }
          return { success: true, width: node.width, height: node.height };
        }
        case "set_visible": {
          const node = yield figma.getNodeByIdAsync(params.nodeId);
          if (!node)
            throw new Error(`Node not found: ${params.nodeId}`);
          node.visible = params.visible;
          return { success: true, visible: node.visible };
        }
        case "set_text": {
          const node = yield figma.getNodeByIdAsync(params.nodeId);
          if (!node)
            throw new Error(`Node not found: ${params.nodeId}`);
          if (node.type !== "TEXT")
            throw new Error("Node is not a text layer");
          const len = node.characters.length || 1;
          const fonts = /* @__PURE__ */ new Set();
          for (let i = 0; i < len; i++) {
            const f = node.getRangeFontName(i, i + 1);
            if (f !== figma.mixed)
              fonts.add(JSON.stringify(f));
          }
          yield Promise.all([...fonts].map((f) => figma.loadFontAsync(JSON.parse(f))));
          const oldText = node.characters;
          node.characters = params.text;
          return { success: true, oldText, newText: node.characters };
        }
        case "duplicate": {
          const node = yield figma.getNodeByIdAsync(params.nodeId);
          if (!node)
            throw new Error(`Node not found: ${params.nodeId}`);
          const clone = node.clone();
          if (params.x !== void 0)
            clone.x = params.x;
          if (params.y !== void 0)
            clone.y = params.y;
          return { success: true, id: clone.id, name: clone.name };
        }
        case "create_frame": {
          const frame = figma.createFrame();
          frame.name = (_p = params.name) != null ? _p : "Frame";
          frame.resize((_q = params.width) != null ? _q : 100, (_r = params.height) != null ? _r : 100);
          if (params.x !== void 0)
            frame.x = params.x;
          if (params.y !== void 0)
            frame.y = params.y;
          if (params.parentId) {
            const parent = yield figma.getNodeByIdAsync(params.parentId);
            if (parent && "appendChild" in parent)
              parent.appendChild(frame);
          }
          if (params.fill !== void 0)
            frame.fills = [{ type: "SOLID", color: params.fill, opacity: (_s = params.fillOpacity) != null ? _s : 1 }];
          if (params.cornerRadius !== void 0)
            frame.cornerRadius = params.cornerRadius;
          if (params.clipsContent !== void 0)
            frame.clipsContent = params.clipsContent;
          return __spreadValues({ success: true }, nodeInfo(frame));
        }
        case "create_rectangle": {
          const rect = figma.createRectangle();
          rect.name = (_t = params.name) != null ? _t : "Rectangle";
          rect.resize((_u = params.width) != null ? _u : 100, (_v = params.height) != null ? _v : 100);
          if (params.x !== void 0)
            rect.x = params.x;
          if (params.y !== void 0)
            rect.y = params.y;
          if (params.parentId) {
            const parent = yield figma.getNodeByIdAsync(params.parentId);
            if (parent && "appendChild" in parent)
              parent.appendChild(rect);
          }
          if (params.fill !== void 0)
            rect.fills = [{ type: "SOLID", color: params.fill, opacity: (_w = params.fillOpacity) != null ? _w : 1 }];
          if (params.cornerRadius !== void 0)
            rect.cornerRadius = params.cornerRadius;
          if (params.stroke !== void 0) {
            rect.strokes = [{ type: "SOLID", color: params.stroke }];
            rect.strokeWeight = (_x = params.strokeWeight) != null ? _x : 1;
          }
          return __spreadValues({ success: true }, nodeInfo(rect));
        }
        case "create_text": {
          const text = figma.createText();
          text.name = (_y = params.name) != null ? _y : "Text";
          yield figma.loadFontAsync({ family: (_z = params.fontFamily) != null ? _z : "Inter", style: (_A = params.fontStyle) != null ? _A : "Regular" });
          text.fontName = { family: (_B = params.fontFamily) != null ? _B : "Inter", style: (_C = params.fontStyle) != null ? _C : "Regular" };
          text.characters = (_D = params.text) != null ? _D : "";
          if (params.fontSize !== void 0)
            text.fontSize = params.fontSize;
          if (params.x !== void 0)
            text.x = params.x;
          if (params.y !== void 0)
            text.y = params.y;
          if (params.fill !== void 0)
            text.fills = [{ type: "SOLID", color: params.fill }];
          if (params.textAlignHorizontal !== void 0)
            text.textAlignHorizontal = params.textAlignHorizontal;
          if (params.parentId) {
            const parent = yield figma.getNodeByIdAsync(params.parentId);
            if (parent && "appendChild" in parent)
              parent.appendChild(text);
          }
          return __spreadValues({ success: true }, nodeInfo(text));
        }
        case "set_fill": {
          const node = yield figma.getNodeByIdAsync(params.nodeId);
          if (!node)
            throw new Error(`Node not found: ${params.nodeId}`);
          if (!("fills" in node))
            throw new Error("Node does not support fills");
          if (params.color === null) {
            node.fills = [];
          } else {
            node.fills = [{ type: "SOLID", color: params.color, opacity: (_E = params.opacity) != null ? _E : 1 }];
          }
          return { success: true };
        }
        case "set_stroke": {
          const node = yield figma.getNodeByIdAsync(params.nodeId);
          if (!node)
            throw new Error(`Node not found: ${params.nodeId}`);
          if (!("strokes" in node))
            throw new Error("Node does not support strokes");
          if (params.color === null) {
            node.strokes = [];
          } else {
            node.strokes = [{ type: "SOLID", color: params.color }];
            if (params.weight !== void 0)
              node.strokeWeight = params.weight;
            if (params.align !== void 0)
              node.strokeAlign = params.align;
          }
          return { success: true };
        }
        case "set_corner_radius": {
          const node = yield figma.getNodeByIdAsync(params.nodeId);
          if (!node)
            throw new Error(`Node not found: ${params.nodeId}`);
          if ("cornerRadius" in node) {
            node.cornerRadius = params.radius;
          } else {
            throw new Error("Node does not support corner radius");
          }
          return { success: true };
        }
        case "set_opacity": {
          const node = yield figma.getNodeByIdAsync(params.nodeId);
          if (!node)
            throw new Error(`Node not found: ${params.nodeId}`);
          node.opacity = params.opacity;
          return { success: true };
        }
        case "set_effect": {
          const node = yield figma.getNodeByIdAsync(params.nodeId);
          if (!node)
            throw new Error(`Node not found: ${params.nodeId}`);
          if (!("effects" in node))
            throw new Error("Node does not support effects");
          const effect = {
            type: (_F = params.effectType) != null ? _F : "DROP_SHADOW",
            visible: true,
            color: __spreadProps(__spreadValues({}, (_G = params.color) != null ? _G : { r: 0, g: 0, b: 0 }), { a: (_H = params.alpha) != null ? _H : 0.15 }),
            offset: { x: (_I = params.offsetX) != null ? _I : 0, y: (_J = params.offsetY) != null ? _J : 4 },
            radius: (_K = params.radius) != null ? _K : 8,
            spread: (_L = params.spread) != null ? _L : 0
          };
          node.effects = [...node.effects, effect];
          return { success: true };
        }
        case "set_font": {
          const node = yield figma.getNodeByIdAsync(params.nodeId);
          if (!node)
            throw new Error(`Node not found: ${params.nodeId}`);
          if (node.type !== "TEXT")
            throw new Error("Node is not a text layer");
          const family = (_M = params.family) != null ? _M : "Inter";
          const style = (_N = params.style) != null ? _N : "Regular";
          yield figma.loadFontAsync({ family, style });
          node.fontName = { family, style };
          if (params.size !== void 0)
            node.fontSize = params.size;
          if (params.lineHeight !== void 0)
            node.lineHeight = { value: params.lineHeight, unit: "PIXELS" };
          if (params.letterSpacing !== void 0)
            node.letterSpacing = { value: params.letterSpacing, unit: "PERCENT" };
          return { success: true };
        }
        case "set_layout": {
          const node = yield figma.getNodeByIdAsync(params.nodeId);
          if (!node)
            throw new Error(`Node not found: ${params.nodeId}`);
          if (node.type !== "FRAME")
            throw new Error("Node is not a frame");
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
          return { success: true };
        }
        case "reparent": {
          const node = yield figma.getNodeByIdAsync(params.nodeId);
          if (!node)
            throw new Error(`Node not found: ${params.nodeId}`);
          const newParent = yield figma.getNodeByIdAsync(params.newParentId);
          if (!newParent)
            throw new Error(`New parent not found: ${params.newParentId}`);
          if (!("appendChild" in newParent))
            throw new Error("New parent cannot have children");
          newParent.appendChild(node);
          return { success: true, newParentId: newParent.id, x: "x" in node ? node.x : null, y: "y" in node ? node.y : null };
        }
        case "batch": {
          const results = [];
          for (const sub of params.commands) {
            try {
              results.push(yield executeAction(sub.action, sub));
            } catch (e) {
              results.push({ error: e.message });
            }
          }
          return results;
        }
        case "find_all_instances": {
          const scopeNode = params.scopeId ? yield figma.getNodeByIdAsync(params.scopeId) : figma.currentPage;
          if (!scopeNode)
            throw new Error(`Scope node not found: ${params.scopeId}`);
          const nodes = scopeNode.findAllWithCriteria({ types: ["INSTANCE"] });
          return nodes.map((n) => {
            const mc = n.mainComponent;
            return {
              id: n.id,
              name: n.name,
              mainComponentId: mc ? mc.id : null,
              mainComponentName: mc ? mc.name : null,
              x: "x" in n ? n.x : null,
              y: "y" in n ? n.y : null
            };
          });
        }
        case "get_local_components": {
          const scopeNode = params.scopeId ? yield figma.getNodeByIdAsync(params.scopeId) : figma.currentPage;
          if (!scopeNode)
            throw new Error(`Scope node not found: ${params.scopeId}`);
          const comps = scopeNode.findAllWithCriteria({ types: ["COMPONENT", "COMPONENT_SET"] });
          return comps.map((c) => ({
            id: c.id,
            name: c.name,
            type: c.type,
            parentId: c.parent ? c.parent.id : null,
            parentName: c.parent ? c.parent.name : null,
            parentType: c.parent ? c.parent.type : null,
            childrenCount: "children" in c ? c.children.length : 0
          }));
        }
        case "get_all_texts": {
          const scopeNode = params.scopeId ? yield figma.getNodeByIdAsync(params.scopeId) : (_O = figma.currentPage.selection[0]) != null ? _O : figma.currentPage;
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
        }
        case "audit_contrast": {
          let toLinear = function(c) {
            return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
          }, luminance = function(r, g, b) {
            return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
          }, contrastRatio = function(l1, l2) {
            const hi = Math.max(l1, l2), lo = Math.min(l1, l2);
            return (hi + 0.05) / (lo + 0.05);
          }, getSolidFill = function(node) {
            var _a2;
            if (!("fills" in node) || !node.fills || node.fills.length === 0)
              return null;
            for (const f of node.fills) {
              if (f.type === "SOLID" && f.visible !== false)
                return { r: f.color.r, g: f.color.g, b: f.color.b, opacity: (_a2 = f.opacity) != null ? _a2 : 1 };
            }
            return null;
          }, getGradientAvgColor = function(fills) {
            var _a2;
            for (const f of fills) {
              if (f.type && f.type.startsWith("GRADIENT_") && f.visible !== false && ((_a2 = f.gradientStops) == null ? void 0 : _a2.length)) {
                const stops = f.gradientStops;
                const r = stops.reduce((s, x) => s + x.color.r, 0) / stops.length;
                const g = stops.reduce((s, x) => s + x.color.g, 0) / stops.length;
                const b = stops.reduce((s, x) => s + x.color.b, 0) / stops.length;
                return { r, g, b, opacity: 1, isGradient: true };
              }
            }
            return null;
          }, getEffectiveBg = function(node) {
            let n = node.parent;
            while (n && n.type !== "PAGE") {
              if ("fills" in n && n.fills) {
                const solid = getSolidFill(n);
                if (solid && solid.opacity > 0.1)
                  return solid;
                const grad = getGradientAvgColor(n.fills);
                if (grad)
                  return grad;
              }
              n = n.parent;
            }
            return { r: 1, g: 1, b: 1, opacity: 1 };
          };
          const scopeNode = params.scopeId ? yield figma.getNodeByIdAsync(params.scopeId) : figma.currentPage;
          if (!scopeNode)
            throw new Error(`Scope node not found: ${params.scopeId}`);
          const textNodes = scopeNode.findAllWithCriteria({ types: ["TEXT"] });
          const issues = [];
          for (const node of textNodes) {
            const tf = getSolidFill(node);
            if (tf) {
              const bg = getEffectiveBg(node);
              const ratio = contrastRatio(luminance(tf.r, tf.g, tf.b), luminance(bg.r, bg.g, bg.b));
              const size = typeof node.fontSize === "number" ? node.fontSize : 12;
              const bold = typeof node.fontWeight === "number" && node.fontWeight >= 700;
              const isLarge = size >= 18 || size >= 14 && bold;
              const required = isLarge ? 3 : 4.5;
              if (ratio < required) {
                issues.push({
                  id: node.id,
                  name: node.name,
                  text: node.characters ? node.characters.slice(0, 60) : "",
                  fontSize: size,
                  bold,
                  ratio: Math.round(ratio * 100) / 100,
                  required,
                  textColor: { r: Math.round(tf.r * 255), g: Math.round(tf.g * 255), b: Math.round(tf.b * 255) },
                  bgColor: { r: Math.round(bg.r * 255), g: Math.round(bg.g * 255), b: Math.round(bg.b * 255) },
                  bgIsGradient: (_P = bg.isGradient) != null ? _P : false
                });
              }
            }
          }
          return issues;
        }
        case "get_screenshot": {
          const node = yield figma.getNodeByIdAsync(params.nodeId);
          if (!node)
            throw new Error(`Node not found: ${params.nodeId}`);
          const scale = (_Q = params.scale) != null ? _Q : 1;
          const bytes = yield node.exportAsync({ format: "PNG", constraint: { type: "SCALE", value: scale } });
          const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
          let base64 = "";
          for (let i = 0; i < bytes.length; i += 3) {
            const b0 = bytes[i], b1 = (_R = bytes[i + 1]) != null ? _R : 0, b2 = (_S = bytes[i + 2]) != null ? _S : 0;
            base64 += chars[b0 >> 2] + chars[(b0 & 3) << 4 | b1 >> 4] + (i + 1 < bytes.length ? chars[(b1 & 15) << 2 | b2 >> 6] : "=") + (i + 2 < bytes.length ? chars[b2 & 63] : "=");
          }
          return { base64, mimeType: "image/png", width: Math.round(node.width * scale), height: Math.round(node.height * scale) };
        }
        case "get_fills": {
          let extractFills = function(n2) {
            var _a2;
            const result = { id: n2.id, name: n2.name, type: n2.type, fills: [], gradients: [] };
            if ("fills" in n2 && n2.fills) {
              for (const f of n2.fills) {
                if (!f.visible)
                  continue;
                if (f.type === "SOLID") {
                  result.fills.push({ r: Math.round(f.color.r * 255), g: Math.round(f.color.g * 255), b: Math.round(f.color.b * 255), opacity: (_a2 = f.opacity) != null ? _a2 : 1 });
                } else if (f.type.startsWith("GRADIENT_")) {
                  result.gradients.push({ type: f.type, stops: f.gradientStops.map((s) => ({ r: Math.round(s.color.r * 255), g: Math.round(s.color.g * 255), b: Math.round(s.color.b * 255), a: s.color.a, position: s.position })) });
                }
              }
            }
            return result;
          };
          const node = yield figma.getNodeByIdAsync(params.nodeId);
          if (!node)
            throw new Error(`Node not found: ${params.nodeId}`);
          const chain = [];
          let n = node;
          let depth = 0;
          while (n && n.type !== "PAGE" && depth < 8) {
            chain.push(extractFills(n));
            n = n.parent;
            depth++;
          }
          return chain;
        }
        case "get_annotations": {
          const node = (_U = yield figma.getNodeByIdAsync((_T = params.nodeId) != null ? _T : null)) != null ? _U : figma.currentPage;
          const result = { pluginData: {}, sharedData: {} };
          try {
            const keys = node.getPluginDataKeys();
            for (const k of keys)
              result.pluginData[k] = node.getPluginData(k);
          } catch (e) {
          }
          for (const ns of ["accessibility", "annotations", "a11y", "contrast", "figma", "com.figma.accessibility"]) {
            try {
              const sharedKeys = node.getSharedPluginDataKeys(ns);
              if (sharedKeys.length) {
                result.sharedData[ns] = {};
                for (const k of sharedKeys)
                  result.sharedData[ns][k] = node.getSharedPluginData(ns, k);
              }
            } catch (e) {
            }
          }
          if (params.includeChildren && "children" in node) {
            result.childrenData = [];
            const textNodes = node.findAllWithCriteria({ types: ["TEXT"] });
            for (const t of textNodes) {
              const keys = t.getPluginDataKeys();
              if (keys.length) {
                const data = {};
                for (const k of keys)
                  data[k] = t.getPluginData(k);
                result.childrenData.push({ id: t.id, name: t.name, text: t.characters, pluginData: data });
              }
            }
          }
          return result;
        }
        case "get_variables": {
          const collections = figma.variables.getLocalVariableCollections();
          return collections.map((col) => ({
            id: col.id,
            name: col.name,
            modes: col.modes,
            defaultModeId: col.defaultModeId,
            variables: col.variableIds.map((vid) => {
              const v = figma.variables.getVariableById(vid);
              if (!v)
                return null;
              return {
                id: v.id,
                name: v.name,
                type: v.resolvedType,
                values: Object.fromEntries(
                  Object.entries(v.valuesByMode).map(([modeId, val]) => {
                    if (val && typeof val === "object" && val.type === "VARIABLE_ALIAS") {
                      const ref = figma.variables.getVariableById(val.id);
                      return [modeId, { alias: ref ? ref.name : val.id }];
                    }
                    return [modeId, val];
                  })
                )
              };
            }).filter(Boolean)
          }));
        }
        case "get_variable": {
          const v = figma.variables.getVariableById(params.variableId);
          if (!v)
            throw new Error(`Variable not found: ${params.variableId}`);
          const col = figma.variables.getVariableCollectionById(v.variableCollectionId);
          return {
            id: v.id,
            name: v.name,
            type: v.resolvedType,
            collection: col ? { id: col.id, name: col.name, modes: col.modes } : null,
            values: Object.fromEntries(
              Object.entries(v.valuesByMode).map(([modeId, val]) => {
                if (val && typeof val === "object" && val.type === "VARIABLE_ALIAS") {
                  const ref = figma.variables.getVariableById(val.id);
                  return [modeId, { alias: ref ? ref.name : val.id, aliasId: val.id }];
                }
                return [modeId, val];
              })
            )
          };
        }
        case "create_instance": {
          const comp = yield figma.getNodeByIdAsync(params.componentId);
          if (!comp || comp.type !== "COMPONENT")
            throw new Error(`Not a component: ${params.componentId}`);
          const instance = comp.createInstance();
          if (params.parentId) {
            const parent = yield figma.getNodeByIdAsync(params.parentId);
            if (!parent)
              throw new Error(`Parent not found: ${params.parentId}`);
            parent.appendChild(instance);
          }
          if (params.x !== void 0)
            instance.x = params.x;
          if (params.y !== void 0)
            instance.y = params.y;
          return { id: instance.id, name: instance.name, type: instance.type, x: instance.x, y: instance.y };
        }
        case "delete_node": {
          const node = yield figma.getNodeByIdAsync(params.nodeId);
          if (!node)
            throw new Error(`Node not found: ${params.nodeId}`);
          node.remove();
          return { success: true };
        }
        case "add_component_property": {
          const node = yield figma.getNodeByIdAsync(params.componentId);
          if (!node)
            throw new Error(`Node not found: ${params.componentId}`);
          if (node.type !== "COMPONENT" && node.type !== "COMPONENT_SET")
            throw new Error("Node is not a component");
          const key = node.addComponentProperty(params.name, params.type, (_V = params.defaultValue) != null ? _V : "");
          return { key, name: params.name, type: params.type };
        }
        case "set_property_reference": {
          const node = yield figma.getNodeByIdAsync(params.nodeId);
          if (!node)
            throw new Error(`Node not found: ${params.nodeId}`);
          node.componentPropertyReferences = params.references;
          return { success: true, nodeId: params.nodeId, references: params.references };
        }
        case "get_component_properties": {
          const node = yield figma.getNodeByIdAsync(params.nodeId);
          if (!node)
            throw new Error(`Node not found: ${params.nodeId}`);
          if (!("componentPropertyDefinitions" in node))
            throw new Error("Node has no component properties");
          return node.componentPropertyDefinitions;
        }
        case "combine_as_variants": {
          const components = [];
          for (const id of params.componentIds) {
            const node = yield figma.getNodeByIdAsync(id);
            if (!node || node.type !== "COMPONENT")
              throw new Error(`Not a component: ${id}`);
            components.push(node);
          }
          const parent = params.parentId ? yield figma.getNodeByIdAsync(params.parentId) : components[0].parent;
          const set = figma.combineAsVariants(components, parent);
          if (params.name)
            set.name = params.name;
          return { id: set.id, name: set.name, type: set.type, x: set.x, y: set.y, width: set.width, height: set.height };
        }
        case "create_component_from_node": {
          const node = yield figma.getNodeByIdAsync(params.nodeId);
          if (!node)
            throw new Error(`Node not found: ${params.nodeId}`);
          const component = figma.createComponentFromNode(node);
          if (params.name)
            component.name = params.name;
          return { id: component.id, name: component.name, type: component.type };
        }
        case "create_variable_collection": {
          const col = figma.variables.createVariableCollection(params.name);
          const modeNames = params.modes || ["Value"];
          col.renameMode(col.modes[0].modeId, modeNames[0]);
          for (let i = 1; i < modeNames.length; i++) {
            col.addMode(modeNames[i]);
          }
          return { id: col.id, name: col.name, modes: col.modes };
        }
        case "create_variable": {
          const col = figma.variables.getVariableCollectionById(params.collectionId);
          if (!col)
            throw new Error(`Collection not found: ${params.collectionId}`);
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
    });
  }
  figma.ui.onmessage = (msg) => __async(void 0, null, function* () {
    const _a = msg, { id, action } = _a, params = __objRest(_a, ["id", "action"]);
    let result;
    try {
      result = yield executeAction(action, params);
    } catch (e) {
      result = { error: e.message };
    }
    figma.ui.postMessage({ id, result });
  });
})();
