// Variables, collections, modes, and variable bindings.
// All getters are async — required under manifest `documentAccess: "dynamic-page"`.
import { requireNode, isColorInput, loadNodeFonts, loadFont } from '../lib/helpers.js';

// A variable by id, or — failing that — a local variable by its full name ('color/blue/500').
async function findVariable(ref) {
  const byId = await figma.variables.getVariableByIdAsync(ref);
  if (byId) return byId;
  const all = await figma.variables.getLocalVariablesAsync();
  return all.find(v => v.name === ref) ?? null;
}

// COLOR variables also take CSS strings / color-space objects (see helpers). Other
// types pass through untouched — a STRING variable may legitimately hold "#fff".
// { alias: '<variable id or name>' } (or a raw VARIABLE_ALIAS) points the mode at another
// variable — how semantic tokens reference primitives.
async function variableValue(variable, value) {
  if (value && typeof value === 'object' && (value.alias !== undefined || value.type === 'VARIABLE_ALIAS')) {
    const ref = value.alias ?? value.id;
    const target = await findVariable(ref);
    if (!target) throw new Error(`Alias target not found: ${ref}`);
    return figma.variables.createVariableAlias(target);
  }
  return variable.resolvedType === 'COLOR' && isColorInput(value) ? figma.util.rgba(value) : value;
}

// Mode values as readable JSON: aliases become { alias: name, aliasId }.
async function describeValues(valuesByMode) {
  return Object.fromEntries(await Promise.all(Object.entries(valuesByMode).map(async ([modeId, val]) => {
    if (val && typeof val === 'object' && val.type === 'VARIABLE_ALIAS') {
      const ref = await figma.variables.getVariableByIdAsync(val.id);
      return [modeId, { alias: ref ? ref.name : val.id, aliasId: val.id }];
    }
    return [modeId, val];
  })));
}

// Name, description, scopes and code syntax shared by create_variable / update_variable.
async function applyVariableMeta(variable, params) {
  if (params.name !== undefined && params.name !== variable.name) variable.name = params.name;
  if (params.description !== undefined) variable.description = params.description;
  if (params.hiddenFromPublishing !== undefined) variable.hiddenFromPublishing = params.hiddenFromPublishing;
  if (params.scopes !== undefined) variable.scopes = params.scopes;
  if (params.codeSyntax) {
    for (const [platform, value] of Object.entries(params.codeSyntax)) {
      if (value) variable.setVariableCodeSyntax(platform, value);
      else variable.removeVariableCodeSyntax(platform);
    }
  }
  if (params.values) {
    // Keys are mode ids or mode names ('Light', 'Dark').
    const col = await figma.variables.getVariableCollectionByIdAsync(variable.variableCollectionId);
    for (const [mode, value] of Object.entries(params.values)) {
      const m = col.modes.find(x => x.modeId === mode) ?? col.modes.find(x => x.name === mode);
      if (!m) throw new Error(`Mode not found in "${col.name}": ${mode}`);
      variable.setValueForMode(m.modeId, await variableValue(variable, value));
    }
  }
}

// Before binding fontFamily / fontStyle, load the font the variable resolves to —
// Figma refuses to apply a font that isn't loaded.
async function preloadVariableFont(node, prop, variable) {
  if (!variable || (prop !== 'fontFamily' && prop !== 'fontStyle')) return;
  const cur = node.fontName === figma.mixed ? null : node.fontName;
  const value = variable.resolveForConsumer(node).value;
  if (!cur || typeof value !== 'string') return;
  const font = prop === 'fontFamily' ? { family: value, style: cur.style } : { family: cur.family, style: value };
  await loadFont(font);
}

// Bind — or, with variable = null, unbind — one variable on a node or a local style.
//   fills / strokes → paint color at `index`;  effects → `field` of the effect at `index`
//   ('color'|'radius'|'spread'|'offsetX'|'offsetY');  anything else → setBoundVariable,
//   which on TEXT nodes covers typography (fontSize, lineHeight, fontFamily, …) and
//   with `start` / `end` binds just that character range.
async function bindVariable(params, variable) {
  const prop = params.property;
  const index = params.index ?? 0;
  const bindPaint = (paints) => {
    if (paints === figma.mixed) throw new Error('This text has different fills per range — bind with start / end, or set one fill first');
    if (!paints || !paints[index]) throw new Error(`No paint at index ${index}`);
    const out = [...paints];
    out[index] = figma.variables.setBoundVariableForPaint(out[index], 'color', variable);
    return out;
  };
  const bindEffect = async (effects) => {
    if (!effects || !effects[index]) throw new Error(`No effect at index ${index}`);
    const field = params.field ?? 'color';
    const out = [...effects];
    let effect = figma.variables.setBoundVariableForEffect(out[index], field, variable);
    // Unbinding one field drops the effect's other bindings too — put them back.
    if (!variable) {
      for (const [f, alias] of Object.entries(out[index].boundVariables ?? {})) {
        if (f === field || !alias) continue;
        const keep = await figma.variables.getVariableByIdAsync(alias.id);
        if (keep) effect = figma.variables.setBoundVariableForEffect(effect, f, keep);
      }
    }
    out[index] = effect;
    return out;
  };

  // layoutGrids → `field` ('count'|'gutterSize'|'offset'|'sectionSize') of the grid at `index`
  const bindGrid = (grids) => {
    if (!grids || !grids[index]) throw new Error(`No layout grid at index ${index}`);
    const out = [...grids];
    out[index] = figma.variables.setBoundVariableForLayoutGrid(out[index], params.field ?? 'gutterSize', variable);
    return out;
  };

  if (params.styleId) {
    const style = await figma.getStyleByIdAsync(params.styleId);
    if (!style) throw new Error(`Style not found: ${params.styleId}`);
    if (style.type === 'PAINT') style.paints = bindPaint(style.paints);
    else if (style.type === 'EFFECT') style.effects = await bindEffect(style.effects);
    else if (style.type === 'GRID') style.layoutGrids = bindGrid(style.layoutGrids);
    else if (style.type === 'TEXT') {
      await loadFont(style.fontName);
      style.setBoundVariable(prop, variable);
    } else throw new Error(`Cannot bind variables on a ${style.type} style`);
    return { styleId: style.id, styleName: style.name };
  }

  const node = await requireNode(params.nodeId);
  if (prop === 'fills' || prop === 'strokes') {
    node[prop] = bindPaint(node[prop]);
  } else if (prop === 'effects') {
    node.effects = await bindEffect(node.effects);
  } else if (prop === 'layoutGrids') {
    node.layoutGrids = bindGrid(node.layoutGrids);
  } else if (node.type === 'TEXT') {
    await loadNodeFonts(node);
    await preloadVariableFont(node, prop, variable);
    if (params.start !== undefined) node.setRangeBoundVariable(params.start, params.end ?? node.characters.length, prop, variable);
    else node.setBoundVariable(prop, variable);
  } else {
    node.setBoundVariable(prop, variable);
  }
  return { nodeId: node.id };
}

export const variablesHandlers = {
  async get_variables() {
    const collections = await figma.variables.getLocalVariableCollectionsAsync();
    return Promise.all(collections.map(async col => ({
      id: col.id,
      key: col.key,
      name: col.name,
      modes: col.modes,
      defaultModeId: col.defaultModeId,
      ...(col.hiddenFromPublishing ? { hiddenFromPublishing: true } : {}),
      ...(col.isExtension ? { isExtension: true, parentVariableCollectionId: col.parentVariableCollectionId } : {}),
      variables: (await Promise.all(col.variableIds.map(async vid => {
        const v = await figma.variables.getVariableByIdAsync(vid);
        if (!v) return null;
        return {
          id: v.id,
          key: v.key,
          name: v.name,
          type: v.resolvedType,
          scopes: v.scopes,
          ...(v.description ? { description: v.description } : {}),
          ...(v.hiddenFromPublishing ? { hiddenFromPublishing: true } : {}),
          values: await describeValues(v.valuesByMode),
        };
      }))).filter(Boolean),
    })));
  },

  async get_variable(params) {
    const v = await figma.variables.getVariableByIdAsync(params.variableId);
    if (!v) throw new Error(`Variable not found: ${params.variableId}`);
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
      values: await describeValues(v.valuesByMode),
    };
  },

  create_variable_collection(params) {
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
  },

  async create_variable(params) {
    // params: collectionId, name, type ('COLOR'|'FLOAT'|'STRING'|'BOOLEAN'), values { modeId: value },
    // scopes? (e.g. ['GAP'] — where the variable shows up in pickers), description?,
    // codeSyntax? ({ WEB: 'var(--gap-m)', ANDROID, iOS })
    const col = await figma.variables.getVariableCollectionByIdAsync(params.collectionId);
    if (!col) throw new Error(`Collection not found: ${params.collectionId}`);
    // Validate before creating, so a bad `values` doesn't leave an empty variable behind.
    if (params.values !== undefined && (typeof params.values !== 'object' || Array.isArray(params.values))) {
      throw new Error('values must be an object: { modeId: value }');
    }
    const variable = figma.variables.createVariable(params.name, col, params.type);
    try {
      await applyVariableMeta(variable, params);
    } catch (e) {
      variable.remove(); // a bad value or alias shouldn't leave a half-made variable behind
      throw e;
    }
    return { id: variable.id, name: variable.name, type: variable.resolvedType, scopes: variable.scopes };
  },

  async update_variable(params) {
    // params: variableId, values? { modeId: value }, name?, description?, scopes?, codeSyntax?
    const v = await figma.variables.getVariableByIdAsync(params.variableId);
    if (!v) throw new Error(`Variable not found: ${params.variableId}`);
    await applyVariableMeta(v, params);
    return { id: v.id, name: v.name, type: v.resolvedType, scopes: v.scopes };
  },

  async delete_variable(params) {
    // params: variableId
    const v = await figma.variables.getVariableByIdAsync(params.variableId);
    if (!v) throw new Error(`Variable not found: ${params.variableId}`);
    v.remove();
    return { success: true };
  },

  async delete_variable_collection(params) {
    // params: collectionId — removes the collection and every variable in it
    const col = await figma.variables.getVariableCollectionByIdAsync(params.collectionId);
    if (!col) throw new Error(`Collection not found: ${params.collectionId}`);
    const count = col.variableIds.length;
    col.remove();
    return { success: true, deletedVariables: count };
  },

  async apply_variable(params) {
    // params: nodeId | styleId, property, variableId, index?, field? (effects), start?/end? (text range)
    const v = await figma.variables.getVariableByIdAsync(params.variableId);
    if (!v) throw new Error(`Variable not found: ${params.variableId}`);
    const target = await bindVariable(params, v);
    return { success: true, ...target, property: params.property, variableId: v.id, variableName: v.name };
  },

  async detach_variable(params) {
    // params: same as apply_variable, without variableId
    const target = await bindVariable(params, null);
    return { success: true, ...target, property: params.property };
  },

  async get_variable_bindings(params) {
    // params: nodeId
    const node = await requireNode(params.nodeId);
    const result = { nodeId: node.id, name: node.name, bindings: {} };

    const resolve = async (b) => {
      if (!b || !b.id) return null;
      const v = await figma.variables.getVariableByIdAsync(b.id);
      return v ? { id: v.id, name: v.name, type: v.resolvedType } : { id: b.id };
    };

    // Direct bound variables on the node
    if ('boundVariables' in node && node.boundVariables) {
      for (const [prop, binding] of Object.entries(node.boundVariables)) {
        if (!binding) continue;
        result.bindings[prop] = Array.isArray(binding) ? await Promise.all(binding.map(resolve)) : await resolve(binding);
      }
    }

    // Effect bindings: one entry per effect, { field: variable } or null
    if ('effects' in node && node.effects.some(e => e.boundVariables && Object.keys(e.boundVariables).length)) {
      result.bindings.effects = await Promise.all(node.effects.map(async e => {
        const entries = Object.entries(e.boundVariables ?? {});
        if (!entries.length) return null;
        return Object.fromEntries(await Promise.all(entries.map(async ([f, b]) => [f, await resolve(b)])));
      }));
    }

    // Paint bindings (fills/strokes)
    for (const paintProp of ['fills', 'strokes']) {
      if (!(paintProp in node) || !Array.isArray(node[paintProp])) continue;   // mixed text fills: per-range bindings are in get_text_style
      const paints = node[paintProp];
      const paintBindings = [];
      for (const paint of paints) {
        if (paint.boundVariables?.color) {
          const v = await figma.variables.getVariableByIdAsync(paint.boundVariables.color.id);
          paintBindings.push(v ? { id: v.id, name: v.name, type: v.resolvedType } : null);
        } else {
          paintBindings.push(null);
        }
      }
      if (paintBindings.some(b => b !== null)) {
        result.bindings[paintProp] = paintBindings;
      }
    }

    return result;
  },

  async add_mode(params) {
    // params: collectionId, name
    const col = await figma.variables.getVariableCollectionByIdAsync(params.collectionId);
    if (!col) throw new Error(`Collection not found: ${params.collectionId}`);
    const modeId = col.addMode(params.name);
    return { success: true, collectionId: col.id, modeId, modeName: params.name, modes: col.modes };
  },

  async rename_mode(params) {
    // params: collectionId, modeId, name
    const col = await figma.variables.getVariableCollectionByIdAsync(params.collectionId);
    if (!col) throw new Error(`Collection not found: ${params.collectionId}`);
    col.renameMode(params.modeId, params.name);
    return { success: true, collectionId: col.id, modeId: params.modeId, modes: col.modes };
  },

  async remove_mode(params) {
    // params: collectionId, modeId
    const col = await figma.variables.getVariableCollectionByIdAsync(params.collectionId);
    if (!col) throw new Error(`Collection not found: ${params.collectionId}`);
    col.removeMode(params.modeId);
    return { success: true, collectionId: col.id, modes: col.modes };
  },

  async switch_mode(params) {
    // params: nodeId, collectionId, modeId — applies a variable mode to a specific frame/component
    const node = await requireNode(params.nodeId);
    if (!('setExplicitVariableModeForCollection' in node)) {
      throw new Error('Node does not support explicit variable modes');
    }
    const col = await figma.variables.getVariableCollectionByIdAsync(params.collectionId);
    if (!col) throw new Error(`Collection not found: ${params.collectionId}`);
    node.setExplicitVariableModeForCollection(col, params.modeId);
    return { success: true, nodeId: node.id, collectionId: params.collectionId, modeId: params.modeId };
  },

  async reset_mode(params) {
    // params: nodeId, collectionId — removes explicit mode override, falls back to parent/default
    const node = await requireNode(params.nodeId);
    if (!('clearExplicitVariableModeForCollection' in node)) {
      throw new Error('Node does not support explicit variable modes');
    }
    const col = await figma.variables.getVariableCollectionByIdAsync(params.collectionId);
    if (!col) throw new Error(`Collection not found: ${params.collectionId}`);
    node.clearExplicitVariableModeForCollection(col);
    return { success: true };
  },

  async update_variable_collection(params) {
    // params: collectionId, name?, hiddenFromPublishing?
    const col = await figma.variables.getVariableCollectionByIdAsync(params.collectionId);
    if (!col) throw new Error(`Collection not found: ${params.collectionId}`);
    if (params.name !== undefined) col.name = params.name;
    if (params.hiddenFromPublishing !== undefined) col.hiddenFromPublishing = params.hiddenFromPublishing;
    return { id: col.id, name: col.name, modes: col.modes };
  },

  async extend_variable_collection(params) {
    // params: collectionId, name — an extended collection (themes / brands) that inherits
    // every variable and overrides selected values. Figma Enterprise only.
    const col = await figma.variables.getVariableCollectionByIdAsync(params.collectionId);
    if (!col) throw new Error(`Collection not found: ${params.collectionId}`);
    if (typeof col.extend !== 'function') throw new Error('Extended collections are not available in this Figma (Enterprise plans only)');
    const ext = col.extend(params.name);
    return { id: ext.id, name: ext.name, modes: ext.modes, parentVariableCollectionId: col.id };
  },

  async resolve_variable(params) {
    // params: variableId, nodeId? — the final value after following aliases. With nodeId,
    // in the modes that node actually resolves to; without, per mode of the variable's
    // own collection (an alias into another collection uses that collection's default mode).
    const v = await figma.variables.getVariableByIdAsync(params.variableId);
    if (!v) throw new Error(`Variable not found: ${params.variableId}`);
    if (params.nodeId) {
      const node = await requireNode(params.nodeId);
      const r = v.resolveForConsumer(node);
      return { id: v.id, name: v.name, type: r.resolvedType, value: r.value };
    }
    const resolveIn = async (variable, modeId, seen) => {
      let val = variable.valuesByMode[modeId];
      if (val === undefined) {
        const col = await figma.variables.getVariableCollectionByIdAsync(variable.variableCollectionId);
        val = variable.valuesByMode[col.defaultModeId];
      }
      if (val && typeof val === 'object' && val.type === 'VARIABLE_ALIAS') {
        if (seen.has(val.id)) throw new Error('Alias cycle');
        seen.add(val.id);
        const next = await figma.variables.getVariableByIdAsync(val.id);
        if (!next) return { brokenAlias: val.id };
        return { via: next.name, ...(await resolveIn(next, modeId, seen)) };
      }
      return { value: val };
    };
    const col = await figma.variables.getVariableCollectionByIdAsync(v.variableCollectionId);
    const values = {};
    for (const m of col.modes) values[m.name] = await resolveIn(v, m.modeId, new Set([v.id]));
    return { id: v.id, name: v.name, type: v.resolvedType, values };
  },

  async get_node_modes(params) {
    // params: nodeId — modes set on the node itself, inherited from its parents, and
    // resolved by Figma, keyed by collection name.
    const node = await requireNode(params.nodeId);
    const named = async (map) => {
      const out = {};
      for (const [colId, modeId] of Object.entries(map || {})) {
        const col = await figma.variables.getVariableCollectionByIdAsync(colId);
        const mode = col ? col.modes.find(m => m.modeId === modeId) : null;
        out[col ? col.name : colId] = { collectionId: colId, modeId, modeName: mode ? mode.name : null };
      }
      return out;
    };
    // Figma's resolvedVariableModes only covers collections the node itself consumes, so
    // `inherited` walks up the parents: the closest explicit mode per collection wins.
    const inherited = {};
    for (let n = node; n && n.type !== 'DOCUMENT'; n = n.parent) {
      for (const [colId, modeId] of Object.entries(n.explicitVariableModes || {})) {
        if (!(colId in inherited)) inherited[colId] = modeId;
      }
    }
    return {
      nodeId: node.id,
      explicit: await named(node.explicitVariableModes),
      inherited: await named(inherited),
      resolved: await named(node.resolvedVariableModes),
    };
  },
};
