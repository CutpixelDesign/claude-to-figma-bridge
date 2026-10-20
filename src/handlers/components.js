// Components, component sets, variants, and instances.
import { requireNode, nodeInfo, resolveParent } from '../lib/helpers.js';

export const componentsHandlers = {
  async create_instance(params) {
    // params: componentId, parentId, x, y
    // A COMPONENT_SET id instantiates its default variant.
    let comp = await figma.getNodeByIdAsync(params.componentId);
    if (comp && comp.type === 'COMPONENT_SET') comp = comp.defaultVariant;
    if (!comp || comp.type !== 'COMPONENT') throw new Error(`Not a component: ${params.componentId}`);
    const parent = await resolveParent(params.parentId);
    const instance = comp.createInstance();
    if (parent) parent.appendChild(instance);
    if (params.x !== undefined) instance.x = params.x;
    if (params.y !== undefined) instance.y = params.y;
    return { id: instance.id, name: instance.name, type: instance.type, x: instance.x, y: instance.y };
  },

  async add_component_property(params) {
    // params: componentId, name, type ('TEXT'|'BOOLEAN'|'INSTANCE_SWAP'|'VARIANT'|'SLOT'),
    // defaultValue, preferredValues?, description?, slotSettings? (SLOT only)
    const node = await requireNode(params.componentId);
    if (node.type !== 'COMPONENT' && node.type !== 'COMPONENT_SET') throw new Error('Node is not a component');
    const options = {};
    for (const k of ['preferredValues', 'description', 'slotSettings']) {
      if (params[k] !== undefined) options[k] = params[k];
    }
    const key = Object.keys(options).length
      ? node.addComponentProperty(params.name, params.type, params.defaultValue ?? '', options)
      : node.addComponentProperty(params.name, params.type, params.defaultValue ?? '');
    return { key, name: params.name, type: params.type };
  },

  async edit_component_property(params) {
    // params: componentId, propertyKey (e.g. "Label#2044:0"), name?, defaultValue?,
    // preferredValues?, description?, slotSettings?. Renaming keeps the #ID suffix, so
    // instance overrides survive. Returns the property's new key.
    const node = await requireNode(params.componentId);
    if (node.type !== 'COMPONENT' && node.type !== 'COMPONENT_SET') throw new Error('Node is not a component');
    const newValue = {};
    for (const k of ['name', 'defaultValue', 'preferredValues', 'description', 'slotSettings']) {
      if (params[k] !== undefined) newValue[k] = params[k];
    }
    const key = node.editComponentProperty(params.propertyKey, newValue);
    return { success: true, oldKey: params.propertyKey, key };
  },

  async delete_component_property(params) {
    // params: componentId, propertyKey. Destructive: every instance override of it is lost.
    const node = await requireNode(params.componentId);
    if (node.type !== 'COMPONENT' && node.type !== 'COMPONENT_SET') throw new Error('Node is not a component');
    node.deleteComponentProperty(params.propertyKey);
    return { success: true, deletedKey: params.propertyKey };
  },

  async create_slot(params) {
    // params: componentId, name?, parentId? (a frame inside the component; default: the
    // component itself), description?, slotSettings?, preferredValues?.
    // createSlot() makes the SlotNode and its SLOT property together; we diff the
    // property definitions to return the new key, then apply name/settings via edit.
    const comp = await requireNode(params.componentId);
    if (comp.type !== 'COMPONENT') throw new Error('Node is not a component');
    const parent = await resolveParent(params.parentId);
    const before = new Set(Object.keys(comp.componentPropertyDefinitions));
    const slot = comp.createSlot();
    if (parent && parent !== comp) parent.appendChild(slot);
    let key = Object.keys(comp.componentPropertyDefinitions).find(k => !before.has(k)) ?? null;
    const newValue = {};
    for (const k of ['name', 'description', 'slotSettings', 'preferredValues']) {
      if (params[k] !== undefined) newValue[k] = params[k];
    }
    if (key && Object.keys(newValue).length) key = comp.editComponentProperty(key, newValue);
    if (params.name) slot.name = params.name;
    return { success: true, ...nodeInfo(slot), propertyKey: key };
  },

  async reset_slot(params) {
    // params: nodeId — a SLOT inside an instance; restores the component's slot content
    const node = await requireNode(params.nodeId);
    if (node.type !== 'SLOT') throw new Error('Node is not a slot');
    node.resetSlot();
    return { success: true, limitViolations: node.limitViolations };
  },

  async set_property_reference(params) {
    // params: nodeId, references { characters: 'key', mainComponent: 'key', visible: 'key' }
    // Links a layer inside a component to a component property
    const node = await requireNode(params.nodeId);
    node.componentPropertyReferences = params.references;
    return { success: true, nodeId: params.nodeId, references: params.references };
  },

  async get_component_properties(params) {
    const node = await requireNode(params.nodeId);
    if (!('componentPropertyDefinitions' in node)) throw new Error('Node has no component properties');
    return node.componentPropertyDefinitions;
  },

  async combine_as_variants(params) {
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
  },

  async create_component_from_node(params) {
    // Convert an existing frame/group node into a component in-place
    const node = await requireNode(params.nodeId);
    const component = figma.createComponentFromNode(node);
    if (params.name) component.name = params.name;
    return { id: component.id, name: component.name, type: component.type };
  },

  async create_component(params) {
    // params: name, width, height, x?, y?, parentId?
    const parent = await resolveParent(params.parentId);
    const comp = figma.createComponent();
    comp.name = params.name ?? 'Component';
    comp.resize(params.width ?? 100, params.height ?? 100);
    if (params.x !== undefined) comp.x = params.x;
    if (params.y !== undefined) comp.y = params.y;
    if (parent) parent.appendChild(comp);
    return { success: true, ...nodeInfo(comp) };
  },

  async set_instance_property(params) {
    // params: nodeId, properties { propName: value }
    const node = await requireNode(params.nodeId);
    if (node.type !== 'INSTANCE') throw new Error('Node is not a component instance');
    node.setProperties(params.properties);
    return { success: true };
  },

  async get_instance_properties(params) {
    // params: nodeId
    const node = await requireNode(params.nodeId);
    if (node.type !== 'INSTANCE') throw new Error('Node is not a component instance');
    const mainComp = await node.getMainComponentAsync();
    const defsSource = mainComp?.parent?.type === 'COMPONENT_SET' ? mainComp.parent : mainComp;
    const defs = defsSource?.componentPropertyDefinitions ?? {};
    const vals = node.componentProperties ?? {};
    const result = {};
    for (const [key, def] of Object.entries(defs)) {
      result[key] = {
        type: def.type,
        defaultValue: def.defaultValue,
        currentValue: vals[key]?.value ?? def.defaultValue,
        ...(def.variantOptions ? { options: def.variantOptions } : {}),
        ...(def.preferredValues ? { preferredValues: def.preferredValues } : {}),
      };
    }
    return result;
  },

  async swap_instance(params) {
    // params: nodeId, componentId
    const node = await requireNode(params.nodeId);
    if (node.type !== 'INSTANCE') throw new Error('Node is not a component instance');
    const comp = await figma.getNodeByIdAsync(params.componentId);
    if (!comp || comp.type !== 'COMPONENT') throw new Error(`Not a component: ${params.componentId}`);
    node.swapComponent(comp);
    return { success: true, nodeId: node.id, newComponentId: comp.id, newComponentName: comp.name };
  },

  async reset_instance(params) {
    // params: nodeId — reset all overrides on a component instance
    const node = await requireNode(params.nodeId);
    if (node.type !== 'INSTANCE') throw new Error('Node is not a component instance');
    node.removeOverrides(); // resetOverrides() is deprecated since Update 120
    return { success: true };
  },

  async detach_instance(params) {
    // params: nodeId — detach instance from its main component
    const node = await requireNode(params.nodeId);
    if (node.type !== 'INSTANCE') throw new Error('Node is not a component instance');
    const frame = node.detachInstance();
    return { success: true, ...nodeInfo(frame) };
  },
};

Object.assign(componentsHandlers, {
  async set_component_meta(params) {
    // params: nodeId (COMPONENT / COMPONENT_SET), description? (plain text),
    // descriptionMarkdown?, documentationLinks? (array of URLs; [] clears)
    const node = await requireNode(params.nodeId);
    if (node.type !== 'COMPONENT' && node.type !== 'COMPONENT_SET') throw new Error('Node is not a component');
    if (params.descriptionMarkdown !== undefined) node.descriptionMarkdown = params.descriptionMarkdown;
    else if (params.description !== undefined) node.description = params.description;
    if (params.documentationLinks !== undefined) node.documentationLinks = params.documentationLinks.map(uri => ({ uri }));
    return { success: true, description: node.description, documentationLinks: node.documentationLinks };
  },

  async get_component_meta(params) {
    // params: nodeId (component, set, or instance → its main component)
    let node = await requireNode(params.nodeId);
    if (node.type === 'INSTANCE') node = await node.getMainComponentAsync();
    if (!node || (node.type !== 'COMPONENT' && node.type !== 'COMPONENT_SET')) throw new Error('Not a component');
    return {
      id: node.id, key: node.key, name: node.name, type: node.type, remote: node.remote,
      description: node.description, descriptionMarkdown: node.descriptionMarkdown,
      documentationLinks: node.documentationLinks.map(l => l.uri),
      ...(node.type === 'COMPONENT_SET' ? { variants: node.children.map(c => ({ id: c.id, name: c.name })) } : {}),
    };
  },

  async expose_instance(params) {
    // params: nodeId — a nested instance inside a COMPONENT; exposed? (true). Exposed nested
    // instances show their properties on every instance of the parent component.
    const node = await requireNode(params.nodeId);
    if (node.type !== 'INSTANCE') throw new Error('Node is not an instance');
    node.isExposedInstance = params.exposed ?? true;
    return { success: true, isExposedInstance: node.isExposedInstance };
  },

  async get_nested_instances(params) {
    // params: nodeId (INSTANCE), exposedOnly? — nested instances with their ids and
    // property values; pass their ids to set_instance_property / swap_instance.
    const node = await requireNode(params.nodeId);
    if (node.type !== 'INSTANCE') throw new Error('Node is not an instance');
    const list = params.exposedOnly ? node.exposedInstances : node.findAllWithCriteria({ types: ['INSTANCE'] });
    return Promise.all(list.map(async n => {
      const main = await n.getMainComponentAsync();
      let properties = {};
      try {
        for (const [k, p] of Object.entries(n.componentProperties)) properties[k] = p.value;
      } catch (e) { properties = null; }
      return {
        id: n.id, name: n.name, exposed: n.isExposedInstance,
        component: main ? (main.parent && main.parent.type === 'COMPONENT_SET' ? main.parent.name : main.name) : null,
        properties,
      };
    }));
  },

  async get_instance_overrides(params) {
    // params: nodeId (INSTANCE) — which layers inside differ from the main component, and how
    const node = await requireNode(params.nodeId);
    if (node.type !== 'INSTANCE') throw new Error('Node is not an instance');
    return Promise.all(node.overrides.map(async o => {
      const n = await figma.getNodeByIdAsync(o.id);
      return { id: o.id, name: n ? n.name : null, type: n ? n.type : null, fields: o.overriddenFields };
    }));
  },
});
