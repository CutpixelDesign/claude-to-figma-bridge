// Merge every category's handlers into a single action -> function registry.
import { readHandlers } from './read.js';
import { editHandlers } from './edit.js';
import { createHandlers } from './create.js';
import { variablesHandlers } from './variables.js';
import { componentsHandlers } from './components.js';
import { auditHandlers } from './audit.js';
import { stylesHandlers } from './styles.js';
import { structureHandlers } from './structure.js';
import { libraryHandlers } from './library.js';

export const handlers = {
  ...readHandlers,
  ...editHandlers,
  ...createHandlers,
  ...variablesHandlers,
  ...componentsHandlers,
  ...auditHandlers,
  ...stylesHandlers,
  ...structureHandlers,
  ...libraryHandlers,
};
