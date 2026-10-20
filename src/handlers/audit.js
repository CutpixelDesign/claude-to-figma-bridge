// Design-system audits: contrast, missing components, hardcoded colors, etc.
import { resolveScope, errorMessage } from '../lib/helpers.js';

export const auditHandlers = {
  async audit_contrast(params) {
    // WCAG contrast of every text the viewer actually sees (hidden, fully transparent and
    // frame-clipped text is skipped). The background is what is actually
    // painted behind the text's centre: lower siblings (looking inside groups and frames)
    // and ancestors, with paint, layer and text opacity composited. Text whose colour varies
    // by range is checked per range (the worst range is reported). Two cases come back with
    // needsReview: true instead of a ratio — text over an image, and text hidden under an
    // opaque layer above it (not visible at all: usually leftover structure).
    // Large text per WCAG: ≥ 24 px, or ≥ 18.66 px bold.
    const toLinear = (c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
    const luminance = (c) => 0.2126 * toLinear(c.r) + 0.7152 * toLinear(c.g) + 0.0722 * toLinear(c.b);
    const contrast = (a, b) => {
      const hi = Math.max(luminance(a), luminance(b)), lo = Math.min(luminance(a), luminance(b));
      return (hi + 0.05) / (lo + 0.05);
    };
    const over = (top, a, base) => ({ r: top.r * a + base.r * (1 - a), g: top.g * a + base.g * (1 - a), b: top.b * a + base.b * (1 - a) });
    const rgb255 = (c) => ({ r: Math.round(c.r * 255), g: Math.round(c.g * 255), b: Math.round(c.b * 255) });

    // A node's own paint stack as one layer: { color, alpha } (gradients by their average
    // stop), { image: true } when a visible image dominates, or null when nothing is painted.
    function paintLayer(node) {
      if (!('fills' in node) || !Array.isArray(node.fills)) return null;
      let color = null;
      let alpha = 0;
      for (const f of node.fills) {   // bottom → top
        if (f.visible === false) continue;
        const o = (f.opacity ?? 1);
        if (f.type === 'IMAGE' || f.type === 'VIDEO') {
          if (o >= 0.5) return { image: true };
          continue;
        }
        let c = null;
        let a = o;
        if (f.type === 'SOLID') c = f.color;
        else if (f.type && f.type.startsWith('GRADIENT_') && f.gradientStops?.length) {
          const st = f.gradientStops;
          c = { r: st.reduce((n, x) => n + x.color.r, 0) / st.length, g: st.reduce((n, x) => n + x.color.g, 0) / st.length, b: st.reduce((n, x) => n + x.color.b, 0) / st.length };
          a *= st.reduce((n, x) => n + (x.color.a ?? 1), 0) / st.length;
        }
        if (!c || a <= 0) continue;
        color = color ? over(c, a, color) : c;
        alpha = a + alpha * (1 - a);
      }
      if (!color) return null;
      return { color, alpha: alpha * ('opacity' in node ? node.opacity : 1) };
    }

    const contains = (b, p) => b && p.x >= b.x && p.x <= b.x + b.width && p.y >= b.y && p.y <= b.y + b.height;

    // Is the text actually seen? Not when it or an ancestor is hidden or fully transparent,
    // or when a clipping frame (clipsContent) crops away the point being checked.
    function seen(node, point) {
      for (let n = node; n && n.type !== 'PAGE'; n = n.parent) {
        if (n.visible === false) return false;
        if ('opacity' in n && n.opacity === 0) return false;
        if (n !== node && n.clipsContent && !contains(n.absoluteBoundingBox, point)) return false;
      }
      return true;
    }
    const opaque = (l) => l.image || l.alpha >= 0.99;

    // What `node` paints at `point`, top → bottom, pushed onto `out`; true once opaque.
    // Looks inside groups / frames; text glyphs and masks don't count as a background.
    function paintAt(node, point, out) {
      if (node.visible === false || node.type === 'TEXT' || node.isMask || !contains(node.absoluteBoundingBox, point)) return false;
      if ('children' in node) {
        for (let i = node.children.length - 1; i >= 0; i--) if (paintAt(node.children[i], point, out)) return true;
      }
      const own = paintLayer(node);
      if (!own) return false;
      out.push(own);
      return opaque(own);
    }

    const parents = (node) => {
      const chain = [];
      for (let cur = node; cur.parent && cur.parent.type !== 'PAGE' && cur.parent.type !== 'DOCUMENT'; cur = cur.parent) chain.push(cur);
      return chain;
    };

    // The layer drawn opaquely over `point` above `node`, if any — the text isn't visible.
    function coveredBy(node, point) {
      for (const cur of parents(node)) {
        const siblings = cur.parent.children;
        for (let i = siblings.indexOf(cur) + 1; i < siblings.length; i++) {
          if (paintAt(siblings[i], point, [])) return siblings[i].name;
        }
      }
      return null;
    }

    // The colour behind a point under `node`: walk up, taking lower siblings that cover the
    // point and each ancestor's own paint, until something opaque is found.
    function background(node, point) {
      const layers = [];   // top → bottom
      for (const cur of parents(node)) {
        const parent = cur.parent;
        const siblings = parent.children;
        for (let i = siblings.indexOf(cur) - 1; i >= 0; i--) {
          if (paintAt(siblings[i], point, layers)) return composite(layers);
        }
        const own = paintLayer(parent);
        if (own) {
          layers.push(own);
          if (opaque(own)) return composite(layers);
        }
      }
      return composite(layers);
    }

    function composite(layers) {
      if (layers.some(l => l.image)) return { image: true };
      const page = figma.currentPage.backgrounds?.find(b => b.type === 'SOLID');
      let color = page ? page.color : { r: 1, g: 1, b: 1 };
      for (let i = layers.length - 1; i >= 0; i--) color = over(layers[i].color, layers[i].alpha, color);
      return { color };
    }

    // Text colours: one entry per styled range (a single range for uniform text).
    function textColors(node) {
      const ranges = Array.isArray(node.fills)
        ? [{ fills: node.fills, characters: node.characters }]
        : node.getStyledTextSegments(['fills']);
      const out = [];
      for (const seg of ranges) {
        const solid = [...seg.fills].reverse().find(f => f.type === 'SOLID' && f.visible !== false);
        if (solid) out.push({ color: solid.color, alpha: (solid.opacity ?? 1) * node.opacity, characters: seg.characters });
      }
      return out;
    }

    const scopeNode = await resolveScope(params.scopeId);
    const textNodes = scopeNode.findAllWithCriteria({ types: ['TEXT'] });
    const issues = [];
    for (const node of textNodes) {
      if (!node.characters.trim()) continue;
      const b = node.absoluteBoundingBox;
      if (!b) continue;
      const point = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
      if (!seen(node, point)) continue;
      const colors = textColors(node).filter(c => c.alpha > 0);
      if (!colors.length) continue;
      const cover = coveredBy(node, point);
      const size = typeof node.fontSize === 'number' ? node.fontSize : 12;
      const bold = typeof node.fontWeight === 'number' && node.fontWeight >= 700;
      const isLarge = size >= 24 || (size >= 18.66 && bold);
      const required = isLarge ? 3.0 : 4.5;
      const base = { id: node.id, name: node.name, text: node.characters.slice(0, 60), fontSize: size, bold, required };
      if (cover) {
        issues.push({ ...base, ratio: null, needsReview: true, reason: `hidden under "${cover}" — not visible; probably leftover` });
        continue;
      }
      const bg = background(node, point);
      if (bg.image) {
        issues.push({ ...base, ratio: null, needsReview: true, reason: 'text over an image — check by eye' });
        continue;
      }
      let worst = null;
      for (const c of colors) {
        const shown = over(c.color, c.alpha, bg.color);
        const ratio = contrast(shown, bg.color);
        if (!worst || ratio < worst.ratio) worst = { ratio, text: shown, segment: c.characters };
      }
      if (worst.ratio < required) {
        issues.push({
          ...base,
          ratio: Math.round(worst.ratio * 100) / 100,
          textColor: rgb255(worst.text),
          bgColor: rgb255(bg.color),
          ...(colors.length > 1 ? { worstRange: worst.segment.slice(0, 40) } : {}),
        });
      }
    }
    return issues;
  },

  async audit_missing_components(params) {
    // Find all detached instances (mainComponent is null)
    const scopeNode = await resolveScope(params.scopeId);
    const instances = scopeNode.findAllWithCriteria({ types: ['INSTANCE'] });
    const withMain = await Promise.all(instances.map(async n => ({ n, mc: await n.getMainComponentAsync() })));
    return withMain
      .filter(({ mc }) => !mc)
      .map(({ n }) => ({ id: n.id, name: n.name, x: n.x, y: n.y, parentId: n.parent?.id, parentName: n.parent?.name }));
  },

  async audit_hardcoded_colors(params) {
    // Find nodes with solid fills/strokes not bound to a variable
    const scopeNode = await resolveScope(params.scopeId);
    const nodes = scopeNode.findAll(n => 'fills' in n || 'strokes' in n);
    const issues = [];
    for (const n of nodes) {
      const hardcodedFills = [];
      const hardcodedStrokes = [];
      if ('fills' in n && Array.isArray(n.fills)) {
        for (const f of n.fills) {
          if (f.type === 'SOLID' && f.visible !== false && !f.boundVariables?.color) {
            hardcodedFills.push({ r: Math.round(f.color.r*255), g: Math.round(f.color.g*255), b: Math.round(f.color.b*255) });
          }
        }
      }
      if ('strokes' in n && Array.isArray(n.strokes)) {
        for (const s of n.strokes) {
          if (s.type === 'SOLID' && s.visible !== false && !s.boundVariables?.color) {
            hardcodedStrokes.push({ r: Math.round(s.color.r*255), g: Math.round(s.color.g*255), b: Math.round(s.color.b*255) });
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
    // Find text nodes not using a local text style
    const scopeNode = await resolveScope(params.scopeId);
    const texts = scopeNode.findAllWithCriteria({ types: ['TEXT'] });
    return texts
      .filter(n => !n.textStyleId)
      .map(n => ({
        id: n.id,
        name: n.name,
        text: n.characters?.slice(0, 60),
        fontSize: typeof n.fontSize === 'number' ? n.fontSize : null,
        fontFamily: typeof n.fontName === 'object' && !('mixed' in n.fontName) ? n.fontName.family : null,
      }));
  },

  async audit_empty_frames(params) {
    // Find frames with no visible children
    const scopeNode = await resolveScope(params.scopeId);
    const frames = scopeNode.findAllWithCriteria({ types: ['FRAME'] });
    return frames
      .filter(n => n.children.length === 0 || n.children.every(c => c.visible === false))
      .map(n => ({ id: n.id, name: n.name, x: n.x, y: n.y, width: n.width, height: n.height, parentId: n.parent?.id }));
  },

  async audit_all(params, dispatch) {
    // Run all audits and return grouped results
    const scopeId = params.scopeId ?? null;
    const run = async (action) => {
      try { return await dispatch(action, { scopeId }); }
      catch(e) { return { error: errorMessage(e) }; }
    };
    const [missingComponents, hardcodedColors, detachedStyles, emptyFrames, contrastIssues] = await Promise.all([
      run('audit_missing_components'),
      run('audit_hardcoded_colors'),
      run('audit_detached_styles'),
      run('audit_empty_frames'),
      run('audit_contrast'),
    ]);
    return { missingComponents, hardcodedColors, detachedStyles, emptyFrames, contrastIssues };
  },
};
