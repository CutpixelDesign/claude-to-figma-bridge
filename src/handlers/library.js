// Team libraries: library variables, importing components / styles / variables by key,
// and discovering the library assets a file already uses.
// Needs `"permissions": ["teamlibrary"]` in manifest.json for figma.teamLibrary.
// The Plugin API can list library *variables*, but not library components or styles —
// those are imported by key, and keys come from get_library_assets (assets the file
// already uses), get_local_components / get_local_styles in the library file, or the REST API.
import { requireNode, nodeInfo, resolveParent, scopeRoots, errorMessage } from '../lib/helpers.js';

// Imports wait on Figma's servers and can hang forever when the library isn't available
// to this file (unpublished, removed, or no access) — fail with a reason instead.
const IMPORT_TIMEOUT = 20000;
// Plain try/finally: Promise.prototype.finally in Figma's sandbox doesn't pass the value through.
async function withTimeout(promise, what) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(
      `${what} timed out after ${IMPORT_TIMEOUT / 1000}s — the library is probably not published or not available to this file. ` +
      'For components the file already uses, call create_instance with the id from get_library_assets.')), IMPORT_TIMEOUT);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

const STYLE_FIELDS = ['fillStyleId', 'strokeStyleId', 'effectStyleId', 'textStyleId', 'gridStyleId'];

function styleInfo(s) {
  return { id: s.id, key: s.key, name: s.name, type: s.type, remote: s.remote, description: s.description || undefined };
}

export const libraryHandlers = {
  async get_library_variables(params) {
    // params: collectionKey? — without it, lists the library collections enabled for this
    // file; with it, the variables in that collection (name, key, type).
    if (!figma.teamLibrary) throw new Error('teamLibrary is unavailable — add "permissions": ["teamlibrary"] to manifest.json');
    if (params.collectionKey) {
      const vars = await figma.teamLibrary.getVariablesInLibraryCollectionAsync(params.collectionKey);
      return vars.map(v => ({ name: v.name, key: v.key, type: v.resolvedType }));
    }
    const cols = await figma.teamLibrary.getAvailableLibraryVariableCollectionsAsync();
    return cols.map(c => ({ name: c.name, key: c.key, libraryName: c.libraryName }));
  },

  async import_variable(params) {
    // params: key — imports a library variable into the file; returns its local id
    const v = await withTimeout(figma.variables.importVariableByKeyAsync(params.key), 'Variable import');
    return { id: v.id, key: v.key, name: v.name, type: v.resolvedType, collectionId: v.variableCollectionId };
  },

  async import_component(params) {
    // params: key, type? ('COMPONENT'|'COMPONENT_SET'), parentId?, x?, y? — a component or set key. With parentId (or
    // instance: true) also places an instance — a set gives its default variant.
    // params.type: 'COMPONENT_SET' skips straight to the set import.
    let comp;
    if (params.type === 'COMPONENT_SET') {
      comp = await withTimeout(figma.importComponentSetByKeyAsync(params.key), 'Component set import');
    } else {
      try {
        comp = await withTimeout(figma.importComponentByKeyAsync(params.key), 'Component import');
      } catch (e) {
        if (errorMessage(e).includes('timed out')) throw e;
        comp = await withTimeout(figma.importComponentSetByKeyAsync(params.key), 'Component set import');
      }
    }
    const out = { id: comp.id, key: comp.key, name: comp.name, type: comp.type };
    if (params.parentId || params.instance) {
      const parent = await resolveParent(params.parentId);
      const main = comp.type === 'COMPONENT_SET' ? comp.defaultVariant : comp;
      const inst = main.createInstance();
      if (parent) parent.appendChild(inst);
      if (params.x !== undefined) inst.x = params.x;
      if (params.y !== undefined) inst.y = params.y;
      out.instance = nodeInfo(inst);
    }
    return out;
  },

  async import_style(params) {
    // params: key — imports a library paint / text / effect / grid style; returns its id
    return styleInfo(await withTimeout(figma.importStyleByKeyAsync(params.key), 'Style import'));
  },

  async get_library_assets(params) {
    // Library (remote) components, styles and variables this file already uses — the way
    // to get their keys, since the API can't browse a library's components.
    // params: allPages? (default true), scopeId?, includeLocal? — also list local ones.
    const roots = await scopeRoots({ allPages: params.allPages ?? !params.scopeId, scopeId: params.scopeId });
    const comps = new Map();
    const styleIds = new Set();
    const varIds = new Set();
    const collectVars = (bv) => {
      for (const b of Object.values(bv || {})) {
        for (const a of Array.isArray(b) ? b : [b]) if (a && a.id) varIds.add(a.id);
      }
    };
    for (const root of roots) {
      const nodes = 'findAll' in root ? root.findAll() : [];
      for (const n of nodes) {
        if (n.type === 'INSTANCE') {
          const main = await n.getMainComponentAsync();
          if (main) {
            const set = main.parent && main.parent.type === 'COMPONENT_SET' ? main.parent : null;
            const id = set ? set.id : main.id;
            const entry = comps.get(id) ?? {
              id, key: set ? set.key : main.key, name: set ? set.name : main.name,
              type: set ? 'COMPONENT_SET' : 'COMPONENT', remote: main.remote, uses: 0,
            };
            entry.uses++;
            comps.set(id, entry);
          }
        }
        for (const f of STYLE_FIELDS) {
          if (f in n && typeof n[f] === 'string' && n[f]) styleIds.add(n[f]);
        }
        if ('boundVariables' in n) collectVars(n.boundVariables);
        for (const prop of ['fills', 'strokes']) {
          if (prop in n && Array.isArray(n[prop])) for (const p of n[prop]) collectVars(p.boundVariables);
        }
      }
    }
    const keep = (x) => params.includeLocal || x.remote;
    const styles = [];
    for (const id of styleIds) {
      const s = await figma.getStyleByIdAsync(id);
      if (s && keep(s)) styles.push(styleInfo(s));
    }
    const variables = [];
    for (const id of varIds) {
      const v = await figma.variables.getVariableByIdAsync(id);
      if (v && keep(v)) variables.push({ id: v.id, key: v.key, name: v.name, type: v.resolvedType, remote: v.remote });
    }
    return { components: [...comps.values()].filter(keep), styles, variables };
  },

  async get_component_key(params) {
    // params: nodeId — a component, component set, or instance (→ its main component)
    let node = await requireNode(params.nodeId);
    if (node.type === 'INSTANCE') node = await node.getMainComponentAsync();
    if (!node || (node.type !== 'COMPONENT' && node.type !== 'COMPONENT_SET')) throw new Error('Not a component');
    const set = node.type === 'COMPONENT' && node.parent && node.parent.type === 'COMPONENT_SET' ? node.parent : null;
    return {
      id: node.id, key: node.key, name: node.name, type: node.type, remote: node.remote,
      ...(set ? { componentSet: { id: set.id, key: set.key, name: set.name } } : {}),
    };
  },
};
