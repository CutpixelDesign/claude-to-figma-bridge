// Structural operations: reparenting, batching, layer order, grouping, pages, viewport.
import { requireNode, nodeInfo, resolveParent, pageNodeOf, errorMessage, runState, loadSubtreeFonts } from '../lib/helpers.js';

// Moving a node that contains text (into another parent, another page, or just to another
// slot in the layer order) requires every font inside it to be loaded. Load them first;
// when some aren't available on this machine, say which instead of Figma's raw error.
async function moveWithFonts(nodes, move, what = 'move it') {
  const missing = new Set();
  for (const n of nodes) for (const f of await loadSubtreeFonts(n)) missing.add(f);
  try {
    return move();
  } catch (e) {
    if (missing.size) {
      throw new Error(`Can't ${what}: these fonts aren't available on this machine — ${[...missing].join(', ')}. Install them, or move it in Figma by hand`);
    }
    throw e;
  }
}

// Resolve { "$ref": "<index-or-label>.<path>" } markers in a batch command's params
// against the results of earlier commands in the same batch. Plain values pass through,
// so commands without any $ref behave exactly as before.
function resolveRefs(value, scope) {
  if (Array.isArray(value)) return value.map(v => resolveRefs(v, scope));
  if (value && typeof value === 'object') {
    if (typeof value.$ref === 'string') return lookupRef(value.$ref, scope);
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = resolveRefs(v, scope);
    return out;
  }
  return value;
}

function lookupRef(ref, scope) {
  const parts = ref.split('.');
  const key = parts[0];
  if (!(key in scope)) throw new Error(`batch ref "${ref}": no earlier command "${key}"`);
  let cur = scope[key];
  for (let i = 1; i < parts.length; i++) {
    if (cur == null) throw new Error(`batch ref "${ref}": "${parts.slice(0, i).join('.')}" is null`);
    cur = cur[parts[i]];
  }
  if (cur === undefined) throw new Error(`batch ref "${ref}": resolved to undefined`);
  return cur;
}

export const structureHandlers = {
  async reparent(params) {
    const node = await requireNode(params.nodeId);
    const newParent = await figma.getNodeByIdAsync(params.newParentId);
    if (!newParent) throw new Error(`New parent not found: ${params.newParentId}`);
    if (!('appendChild' in newParent)) throw new Error('New parent cannot have children');
    await moveWithFonts([node], () => newParent.appendChild(node), `move "${node.name}" into "${newParent.name}"`);
    return { success: true, newParentId: newParent.id, x: 'x' in node ? node.x : null, y: 'y' in node ? node.y : null };
  },

  async batch(params, dispatch) {
    // Sub-commands run sequentially. A command's params may reference an earlier
    // result via { "$ref": "<index-or-label>.<path>" }; tag a command with
    // "as": "<label>" to reference it by name. Return shape is unchanged: one
    // result per command, in order (failed commands become { error }).
    const results = [];
    const scope = {};
    const run = runState.current;
    if (run && !run.results) run.results = results;   // the watchdog reports what finished
    let i = 0;
    let lastYield = Date.now();
    for (const sub of params.commands) {
      // Steps that never wait on Figma (cached fonts…) run back to back as microtasks, and the
      // watchdog's timer could never fire — yield to the event loop every ~50 ms.
      if (Date.now() - lastYield > 50) {
        await new Promise(resolve => setTimeout(resolve, 0));
        lastYield = Date.now();
      }
      if (run && run.aborted) break;   // the watchdog gave up on this batch — don't keep editing
      let result;
      try {
        const resolved = resolveRefs(sub, scope);
        if (run) { run.step = i; run.stepAction = resolved.action; }
        // Progress for the hub's debug log (BRIDGE_DEBUG=1): which step a slow batch is on.
        figma.ui.postMessage({ type: 'progress', step: i, action: resolved.action });
        result = await dispatch(resolved.action, resolved);
      } catch (e) {
        result = { error: errorMessage(e) };
      }
      results.push(result);
      scope[String(i)] = result;
      if (sub.as) scope[sub.as] = result;
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
    // params: nodeId, index (position within parent's children)
    const node = await requireNode(params.nodeId);
    const parent = node.parent;
    if (!parent || !('insertChild' in parent)) throw new Error('Node has no reorderable parent');
    await moveWithFonts([node], () => parent.insertChild(params.index, node), `reorder "${node.name}"`);
    return { success: true, index: params.index };
  },

  async bring_to_front(params) {
    const node = await requireNode(params.nodeId);
    const parent = node.parent;
    if (!parent || !('insertChild' in parent)) throw new Error('Node has no reorderable parent');
    // appendChild, not insertChild(length - 1): for a node already in this parent,
    // insertChild's index counts the node itself, so length - 1 lands one below the top.
    await moveWithFonts([node], () => parent.appendChild(node), `bring "${node.name}" to front`);
    return { success: true };
  },

  async send_to_back(params) {
    const node = await requireNode(params.nodeId);
    const parent = node.parent;
    if (!parent || !('insertChild' in parent)) throw new Error('Node has no reorderable parent');
    await moveWithFonts([node], () => parent.insertChild(0, node), `send "${node.name}" to back`);
    return { success: true };
  },

  async group(params) {
    // params: nodeIds (array), parentId?, name?
    const nodes = await Promise.all(params.nodeIds.map(id => figma.getNodeByIdAsync(id)));
    const valid = nodes.filter(Boolean);
    if (valid.length === 0) throw new Error('No valid nodes to group');
    const parent = params.parentId
      ? await figma.getNodeByIdAsync(params.parentId)
      : valid[0].parent;
    const group = await moveWithFonts(valid, () => figma.group(valid, parent), 'group these layers');
    if (params.name) group.name = params.name;
    return { success: true, ...nodeInfo(group) };
  },

  async ungroup(params) {
    // params: nodeId
    const node = await requireNode(params.nodeId);
    if (node.type !== 'GROUP') throw new Error('Node is not a group');
    const children = [...node.children].map(nodeInfo);
    figma.ungroup(node);
    return { success: true, children };
  },

  async create_section(params) {
    // params: name?, x?, y?, width?, height?, parentId?
    const parent = await resolveParent(params.parentId);
    const section = figma.createSection();
    section.name = params.name ?? 'Section';
    if (params.x !== undefined) section.x = params.x;
    if (params.y !== undefined) section.y = params.y;
    if (params.width !== undefined && params.height !== undefined) {
      section.resizeWithoutConstraints(params.width, params.height);
    }
    if (parent) parent.appendChild(section);
    return { success: true, ...nodeInfo(section) };
  },

  async resize_section_to_fit(params) {
    // params: nodeId (a SECTION), padding? (default 100) — Figma's "Resize to fit".
    // Sections don't auto-resize; this reflows children to `padding` and resizes the
    // section to their bounding box, keeping the children's absolute canvas positions.
    const section = await requireNode(params.nodeId);
    if (section.type !== 'SECTION') throw new Error('Node is not a section');
    const pad = params.padding ?? 100;
    const children = section.children;
    if (!children.length) throw new Error('Section has no children');
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const c of children) {
      minX = Math.min(minX, c.x);            minY = Math.min(minY, c.y);
      maxX = Math.max(maxX, c.x + c.width);  maxY = Math.max(maxY, c.y + c.height);
    }
    const dx = pad - minX, dy = pad - minY;
    for (const c of children) { c.x += dx; c.y += dy; }
    section.x -= dx; section.y -= dy;
    section.resizeWithoutConstraints((maxX - minX) + pad * 2, (maxY - minY) + pad * 2);
    return { success: true, ...nodeInfo(section) };
  },

  async scroll_to_node(params) {
    // params: nodeId — switches to the node's page first if it lives on another one
    const node = await requireNode(params.nodeId);
    const page = pageNodeOf(node);
    if (page && page !== figma.currentPage) await figma.setCurrentPageAsync(page);
    figma.viewport.scrollAndZoomIntoView([node]);
    return { success: true, page: page ? page.name : null };
  },

  async set_selection(params) {
    // params: nodeIds (array) — a selection lives on one page: switches to the first node's
    // page, and nodes from other pages are skipped (listed in `skipped`).
    const nodes = (await Promise.all(params.nodeIds.map(id => figma.getNodeByIdAsync(id)))).filter(Boolean);
    const page = nodes.length ? pageNodeOf(nodes[0]) : figma.currentPage;
    if (page && page !== figma.currentPage) await figma.setCurrentPageAsync(page);
    const valid = nodes.filter(n => pageNodeOf(n) === page);
    figma.currentPage.selection = valid;
    const skipped = nodes.filter(n => !valid.includes(n)).map(n => n.id);
    return { success: true, selected: valid.map(n => n.id), ...(skipped.length ? { skipped } : {}) };
  },

  noop(params) {
    // Internal: the hub puts this in place of a command it holds back while another
    // session works in the file (a view change, a create without parentId). Echoes `result`.
    return params.result ?? { skipped: true };
  },

  notify(params) {
    // params: message, error? (boolean, shows red toast)
    figma.notify(params.message, { error: params.error ?? false });
    return { success: true };
  },

  async get_pages() {
    await figma.loadAllPagesAsync();
    return figma.root.children.map(p => ({
      id: p.id,
      name: p.name,
      isCurrent: p.id === figma.currentPage.id,
    }));
  },

  async switch_page(params) {
    // params: pageId
    const page = await figma.getNodeByIdAsync(params.pageId);
    if (!page || page.type !== 'PAGE') throw new Error(`Page not found: ${params.pageId}`);
    await figma.setCurrentPageAsync(page);
    return { success: true, pageId: page.id, pageName: page.name };
  },

  async create_page(params) {
    // params: name, index? (position, default: end)
    const page = figma.createPage();
    page.name = params.name ?? 'Page';
    if (params.index !== undefined) {
      await figma.loadAllPagesAsync();
      figma.root.insertChild(params.index, page);
    }
    return { id: page.id, name: page.name };
  },

  async delete_page(params) {
    // params: pageId
    await figma.loadAllPagesAsync();
    if (figma.root.children.length <= 1) throw new Error('Cannot delete the only page');
    const page = figma.root.children.find(p => p.id === params.pageId);
    if (!page) throw new Error(`Page not found: ${params.pageId}`);
    page.remove();
    return { success: true };
  },

  async rename_page(params) {
    // params: pageId, name
    const page = await figma.getNodeByIdAsync(params.pageId);
    if (!page || page.type !== 'PAGE') throw new Error(`Page not found: ${params.pageId}`);
    page.name = params.name;
    return { success: true, pageId: page.id, name: page.name };
  },
};
