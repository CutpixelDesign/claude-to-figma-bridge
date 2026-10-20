# Claude Bridge reference

Claude Bridge drives the Figma files the designer has open: the Claude Bridge plugin runs in each file, and the `claude-bridge` MCP server relays commands to it.

**Tools**
- `figma` — one action: `{ "action": "get_selection" }`, `{ "action": "set_fill", "params": { "nodeId": "1:2", "color": "#3366FF" } }`. Also takes `file`, `saveTo`, `timeoutMs`.
- `figma_batch` — many actions in one call and one undo step: `{ "commands": [{ "action": …, …params, "as"?: "label" }] }`, with `$ref` between them (see Batching).
- `figma_screenshot` — PNG of a node (default: the selection), returned as an image.
- `figma_files` — open files, their `#id`, page, which one is the target, the sessions working in each, queued commands.
- `figma_session` — name this Claude session after its task (default: the project folder); the name shows in other sessions' results and in the plugin window.
- `figma_reference` — this document (`section`: `actions` | `rules`).

**Several files.** Each open file with the plugin is a separate connection. A call without `file` goes to the file the designer is looking at — the one whose tab came to the front last — or that they used last (selection, page change, click on the plugin window); every result starts with the file it ran in. Pass `file` — a name, part of one, or `#id` — when the designer names a file. With several files open and none used yet, the call is refused with the list: ask the designer which one.

**Several sessions.** Two Claude chats can work at the same time — even in the same file. Each session has its own queue per file, and the plugin runs one command from each session in turn: a batch always runs whole, never mixed with another session's steps, and no session waits longer than one of the other's batches. A session counts as working in a file for 2 minutes after its last command there (or until it closes). While a file is shared:
- results start with a `Shared:` line naming the other sessions — call `figma_session` to name yourself after your task;
- `scroll_to_node`, `switch_page` and `set_selection` are skipped (`{ skipped: true, reason }`) so the designer's view and the other session's current page stay put;
- creates without `parentId` (`create_*`, `import_component` with `instance`) are refused — they would land on whatever page the designer is on; pass a page or frame id;
- pass `pageId` / `scopeId` to reads instead of relying on the current page, and work in your own area (a page or section) so the sessions don't edit the same nodes;
- the undo history is shared: Cmd+Z undoes the last batch, whichever session sent it.

**Pairing.** A plugin gets commands only once it's paired with this computer. When a call fails with "open but not paired", the error names an 8-character code: tell the designer to type it in the plugin window (it's asked once per computer), then retry.

**HTTP (scripts / fallback).** The same hub listens on `http://localhost:3571`: `POST /command` with `{ action, …params, file?, timeoutMs?, saveTo? }` (response headers `X-Figma-File`, `X-Figma-File-Id`, `X-Figma-Others` — URI-encoded JSON list of other sessions), `GET /status`, `GET /files`. Requests must not carry an `Origin` header (browsers are refused) and POSTs must be `Content-Type: application/json`. Send `X-Bridge-Session-Id` / `X-Bridge-Session-Name` to get a queue of your own; without them all HTTP callers share the session "HTTP". Without Claude Code running, start it with `node server/server.js` from the repo.

## Actions

**Reading:**
- `get_selection` — what's selected right now
- `get_node` — node by ID (`nodeId`)
- `get_children` — direct children (`nodeId`)
- `get_tree` — node subtree (`nodeId`, `depth`, `fields?`) · `get_page_tree` — a page (`depth`, `pageId?` = current) · `get_parent` — ancestor chain (`nodeId`)
- `get_layout` — raw layout & look properties for audits (`nodeId`, `deep?` — whole subtree as a flat list with `depth` / `parentId`, `depth?` limit, `intoInstances?` = true; to keep big reads small: `fields?` — only these keys per node, `types?` — deep: only these node types, `summary?: true` — deep: statistics instead of nodes: types, frame widths, text-style / variable / spacing-token coverage, font sizes, gaps / paddings / radii in use, unbound colors, instances, detached-looking frames, generic names, hidden layers): `layoutMode`, padding, `itemSpacing`, wrap, alignment, `strokesIncludedInLayout`, grid tracks; `layoutSizingHorizontal/Vertical`, `layoutPositioning`, min/max, constraints, `lockAspectRatio`; text `textAutoResize` / truncation / `lineHeight`; radii, stroke weights, opacity, `clipsContent`; fills / strokes / effects with bound variable names; `bound` — variables on other fields (a variable outside the file's own collections is marked: `Name [library: Collection]`, or `Name [stale: Collection]` when its collection is gone from the file — a leftover binding that may share a name with a current token but hold another value); `component` — main component name + variant for instances; layout grids, explicit variable modes, `locked`, `overflowDirection`. Defaults are omitted. Prefer it over `get_node` + `get_css` + `get_constraints` + `get_variable_bindings` for inspection
- `get_page_nodes` — top-level nodes of a page (`pageId?` = current — reads another page without switching)
- `get_file_info` — file name, current page, editor type (`fileKey` is null for development plugins — see Per-project design notes)
- `get_text` — text content (`nodeId`)
- `get_text_style` — typography (`nodeId`): first-run fields at the top, plus `mixed` and `segments` (every styled run with font, size, `variationSettings`, `textWrapStyle`, `textStyleId`, fills, bound variables, `hyperlink`, list options, paragraph spacing), plus alignment / auto-resize
- `get_css` — the CSS Dev Mode shows for a node (`nodeId`)
- `get_fills` — fills with parent chain (`nodeId`): solid colors, gradients, images (`imageHash` → `get_image`)
- `get_effects` — effects with all their parameters: shadows, blurs, glass… (`nodeId`, `deep?` — the whole subtree)
- `get_variables` — all local variable collections (with `key`, aliases as `{ alias: name, aliasId }`) · `get_variable` — one variable in full (`variableId`)
- `get_local_components` — components and sets with `key` and description (`scopeId?`, `allPages?`, `variants?` = true — `false` hides variants inside sets)
- `find_all_instances` — component instances (`scopeId?`, `allPages?`, `componentId?` / `componentName?` — a component or set)
- `get_all_texts` — all text nodes in scope (`scopeId`)
- `get_screenshot` — export as base64 PNG (`nodeId`, `scale`)
- `get_image` — the original image behind an IMAGE fill, full resolution (`nodeId`, `index?`, or `imageHash`)
- `get_vector` — path data of a vector (`nodeId`)
- `get_prototype` — reactions of a node (`nodeId`, `deep?`), or without `nodeId` a page's flows + every node with interactions (`pageId?` = current page)
- `get_plugin_data` — (`nodeId`, `key?`, `namespace?` — shared data of other plugins) · `get_export_settings` (`nodeId`)
- `audit_contrast` — WCAG contrast failures (`scopeId`): only text the viewer sees (hidden, 0 % opacity and frame-clipped text is skipped); the background is what is painted behind the text — lower siblings, also inside groups, and ancestors, with opacities composited; text with several colours is judged by its worst range (`worstRange`). Entries with `needsReview: true` and no ratio: text over an image, or text hidden under another layer (structure leftovers). Large text = ≥ 24 px or ≥ 18.66 px bold

**Editing:**
- `rename` — rename node (`nodeId`, `name`)
- `move` — set position (`nodeId`, `x`, `y`) · `move_by` — relative (`nodeId`, `dx`, `dy`)
- `resize` — set size (`nodeId`, `width`, `height`, `withConstraints?`). Default: children stay put. `withConstraints: true` resizes like dragging a handle in Figma — children follow their constraints; use it to check that a non-auto-layout frame (or an instance) reflows
- `set_visible` — show/hide (`nodeId`, `visible`)
- `set_text` — update text (`nodeId`, `text`)
- `set_fill` — set fill color (`nodeId`, `color: {r,g,b}`, `opacity`)
- `set_stroke` — set stroke (`nodeId`, `color`, `opacity?`, `weight`, `align?: INSIDE|OUTSIDE|CENTER`)
- `set_corner_radius` — corner radius (`nodeId`, `radius`)
- `set_opacity` — opacity (`nodeId`, `opacity`)
- `set_font` — typography (`nodeId`, `family?`, `style?`, `variationSettings?` — variable-font axes like `{ "wght": 450 }`, `size?`, `lineHeight?` — `24` px / `"150%"` / `"AUTO"`, `letterSpacing?` — number % / `"1px"`, `textWrapStyle?: AUTO|BALANCE|PRETTY`, `paragraphSpacing?`, `paragraphIndent?`, `textCase?`, `textDecoration?`, `leadingTrim?`, `listSpacing?`, `align?: LEFT|CENTER|RIGHT|JUSTIFIED`, `verticalAlign?: TOP|CENTER|BOTTOM`, `maxLines?`, `truncation?: DISABLED|ENDING`) — whole node; omitted font params keep the current font; axes without `style` pick the closest named instance
- `set_text_range` — style part of a text (`nodeId`, `start`/`end` or `match` — every occurrence of a substring; then `family?`, `style?`, `variationSettings?`, `size?`, `color?` + `opacity?`, `fills?`, `lineHeight?`, `letterSpacing?`, `textCase?`, `textDecoration?`, `hyperlink?` — URL / `{ type: "NODE", value: nodeId }` / `null`, `listType?: ORDERED|UNORDERED|NONE`, `indentation?`, `paragraphSpacing?`, `paragraphIndent?`, `textStyleId?`, `fillStyleId?`)
- `set_layout` — auto-layout on FRAME / COMPONENT / COMPONENT_SET / INSTANCE (`nodeId`, `mode: HORIZONTAL|VERTICAL|GRID|NONE`, `gap`, `padding`, `paddingTop/Bottom/Left/Right`, `align` — incl. `SPACE_BETWEEN|SPACE_EVENLY|SPACE_AROUND`, `counterAlign`, `wrap` — works for vertical too, `counterGap` — gap between wrapped rows, `alignContent: AUTO|SPACE_BETWEEN` — how wrapped rows spread). Grid: `rows`, `columns`, `rowGap`, `columnGap`, `rowSizes` / `columnSizes` (`[{ type: FIXED|FLEX|HUG, value? }]`)
- `set_grid_child` — place a direct child of a GRID frame (`nodeId`, `row?`, `column?` 0-based, `rowSpan?`, `columnSpan?`, `horizontalAlign?` / `verticalAlign?`: `MIN|CENTER|MAX|AUTO`)
- `set_effect` — append one effect (`nodeId`, `effectType`, `color`, `opacity`, `offsetX/Y`, `blur` (alias `radius`), `spread`, `blendMode?` for shadows/blurs) — or pass `effect` (a full Figma Effect object) for any type: NOISE, TEXTURE, GLASS, progressive blur…; read shapes with `get_effects`
- `set_effects` — replace the whole effects array (`nodeId`, `effects`; `[]` clears)
- `set_layout_grids` — column / row / pixel grids (`nodeId`, `grids: [{ pattern: COLUMNS|ROWS|GRID, count?, gutterSize?, offset?, alignment?: STRETCH|MIN|MAX|CENTER, sectionSize?, color? }]`; missing fields get defaults; `[]` clears)
- `set_locked` — lock / unlock (`nodeId`, `locked`)
- `set_mask` — use as mask for the siblings above it (`nodeId`, `isMask?` = true, `maskType?: ALPHA|VECTOR|LUMINANCE`)
- `set_export_settings` — the Export panel (`nodeId`, `settings: [{ format, suffix?, constraint? }]`)
- `set_reactions` — prototype interactions (`nodeId`, `reactions` — full Reaction array, shapes from `get_prototype`; `[]` clears) · `set_flow_starting_points` — replace a page's flows (`flows: [{ nodeId, name }]`, `[]` clears; `pageId?` — defaults to the first flow node's page)
- `set_plugin_data` — store data on a node (`nodeId`, `key`, `value`, `namespace?` → shared)
- `set_properties` — escape hatch: any writable node property without its own action (`nodeId`, `properties: { overflowDirection: "VERTICAL", strokeCap: "ROUND", cornerSmoothing: 0.6, … }`); per-key `errors`, the rest still apply
- `set_annotation` — Dev Mode annotation on a node (`nodeId`, `label` markdown, `categoryId?`, `properties?: [{ type: "fills" }, …]`; or `annotations` — full array; nothing clears) — native annotations, NOT Figma comments (comments aren't exposed to plugins)
- `get_annotations` — annotations on a node (`nodeId?`, `includeChildren?` — every annotated descendant) · `get_annotation_categories` — ids for `categoryId`

**Variables & modes:**
- `create_variable_collection` — создать коллекцию (`name`, `modes?: string[]`) · `update_variable_collection` (`collectionId`, `name?`, `hiddenFromPublishing?`)
- `add_mode` (`collectionId`, `name`) · `rename_mode` (`collectionId`, `modeId`, `name`) · `remove_mode` (`collectionId`, `modeId`)
- `extend_variable_collection` — extended collection for themes / brands (`collectionId`, `name`) — Figma Enterprise only
- `create_variable` — создать переменную (`collectionId`, `name`, `type: COLOR|FLOAT|STRING|BOOLEAN`, `values: { modeId or mode name: value }`, `scopes?`, `description?`, `codeSyntax?: { WEB, ANDROID, iOS }`, `hiddenFromPublishing?`)
  - a value `{ "alias": "<variable id or name>" }` makes that mode an alias — semantic tokens on top of primitives: `"values": { "Light": { "alias": "color/blue/500" }, "Dark": { "alias": "color/blue/300" } }`
- `update_variable` — изменить переменную (`variableId`, `values?` — aliases too, `name?`, `scopes?`, `description?`, `codeSyntax?`, `hiddenFromPublishing?`)
- `resolve_variable` — the final value after aliases (`variableId`, `nodeId?` — in that node's modes; without it, per mode, with the `via` chain)
  - `scopes` — where the variable is offered in pickers: `ALL_SCOPES`, `GAP`, `CORNER_RADIUS`, `WIDTH_HEIGHT`, `ALL_FILLS`, `FRAME_FILL`, `SHAPE_FILL`, `TEXT_FILL`, `STROKE_COLOR`, `STROKE_FLOAT`, `EFFECT_COLOR`, `EFFECT_FLOAT`, `OPACITY`, `COLOR_OPACITY`, `TEXT_CONTENT`, `FONT_FAMILY`, `FONT_STYLE`, `FONT_WEIGHT`, `FONT_SIZE`, `LINE_HEIGHT`, `LETTER_SPACING`, `PARAGRAPH_SPACING`, `PARAGRAPH_INDENT`. Set them when creating tokens (spacing → `GAP`, radius → `CORNER_RADIUS`, …)
- `delete_variable` — удалить переменную (`variableId`)
- `delete_variable_collection` — удалить коллекцию со всеми переменными (`collectionId`)
- `apply_variable` — привязать переменную (`nodeId` or `styleId`, `property`, `variableId`, `index?`, `field?`, `start?`/`end?`):
  - `fills` / `strokes` → paint color at `index` (default 0)
  - `effects` → `field` (`color|radius|spread|offsetX|offsetY`) of the effect at `index`
  - TEXT nodes → `fontSize`, `lineHeight`, `letterSpacing`, `fontFamily`, `fontStyle`, `fontWeight`, `paragraphSpacing`, `paragraphIndent`; `start`/`end` binds a character range
  - `styleId` binds inside a local style: paint style → `fills`-like paint at `index`, effect style → `effects` + `field`, text style → typography fields
  - `layoutGrids` → `field` (`count|gutterSize|offset|sectionSize`) of the grid at `index` (nodes and grid styles)
  - anything else → node field (`itemSpacing`, `paddingTop`, `cornerRadius`, `width`, `opacity`, `visible`, `gridRowGap`, …)
- `detach_variable` — отвязать (same params as `apply_variable`, without `variableId`)
- `get_variable_bindings` — посмотреть все привязки переменных на ноде (`nodeId`)
- `switch_mode` — переключить режим на фрейме (`nodeId`, `collectionId`, `modeId`)
- `reset_mode` — сбросить явный режим, вернуться к родительскому (`nodeId`, `collectionId`)
- `get_node_modes` — which mode a node is in, per collection (`nodeId`): `explicit`, `inherited` (from parents), `resolved`

**Audit:**
All audits take `scopeId?` (default: current page).
- `audit_missing_components` — detached instances без main component
- `audit_hardcoded_colors` — заливки/обводки не из переменных
- `audit_detached_styles` — текстовые слои без text style
- `audit_empty_frames` — фреймы без содержимого
- `audit_contrast` — нарушения контраста WCAG (details under Reading)
- `audit_all` — все проверки за один запрос (возвращает сгруппированный отчёт)

**Search:**
- `find_nodes` — filters combine with AND: `name` (substring), `nameRegex`, `type` (one or an array), `text` (exact), `textContains`, `fill` / `stroke` (hex of a solid paint), `variable` (id or name bound anywhere), `style` (id or name), `component` (instances of a component / set — id or name), `visible`, `locked`; scope: `scopeId` (searches its descendants) or `allPages`; `limit` = 50; `fields?` — return these `get_layout` keys per match instead of the basic card

**Pages:**
- `get_pages` — list all pages
- `switch_page` — switch to page (`pageId`)
- `create_page` — create new page (`name`, `index?`)
- `delete_page` — delete page (`pageId`)
- `rename_page` — rename page (`pageId`, `name`)

**Viewport & selection:**
- `scroll_to_node` — zoom to node (`nodeId`); switches to the node's page if needed
- `set_selection` — select nodes (`nodeIds`); switches to the first node's page, nodes on other pages come back in `skipped`
- `notify` — show toast in Figma (`message`, `error?`)

**Moving layers that contain text** (`reparent`, `reorder`, `bring_to_front`, `send_to_back`, `group`) needs every font inside loaded — the bridge loads them itself. When a font isn't available on this machine, Figma doesn't let plugins move that layer at all: the error names the missing fonts — ask the designer to move it by hand (e.g. right-click → Move to page), or install the fonts.

**Layer order:**
- `bring_to_front` — bring to front (`nodeId`)
- `send_to_back` — send to back (`nodeId`)
- `reorder` — set exact index in parent (`nodeId`, `index`) — the index counts the node's current slot, so moving down needs target + 1 (to the end: `index` = number of children)

**Grouping:**
- `group` — group nodes (`nodeIds`, `name?`, `parentId?`)
- `ungroup` — ungroup (`nodeId`)

**Styles:**
- `get_local_styles` — local styles with full values and `key` (`type?: paint|text|effect|grid`): paints as hex / gradient stops / image hashes, typography incl. paragraph settings, effects, layout grids
- `create_text_style` — (`name`, `fontFamily`, `fontStyle`, `variationSettings?`, `fontSize`, `lineHeight?`, `letterSpacing?`, `paragraphSpacing?`, `textCase?`, … same values as `set_font`, `description?`)
- `update_style` — edit a local style in place, every user updates (`styleId`, `name?`, `description?`; paint: `color?` + `opacity?` or `paints?`; text: `fontFamily?`, `fontStyle?`, `variationSettings?` + the `set_font` typography fields (`fontSize`, `lineHeight`, `letterSpacing`, `paragraphSpacing`, …); effect: `effects`; grid: `layoutGrids`)
- `get_style_consumers` — every node using a style and through which field (`styleId`, `limit?`)
- `create_grid_style` (`name`, `layoutGrids`, `description?`) · `apply_grid_style` (`nodeId`, `styleId`)
- `apply_paint_style` — apply color style (`nodeId`, `styleId`, `target?`)
- `apply_text_style` — apply text style to text node (`nodeId`, `styleId`)
- `apply_effect_style` — apply effect style (`nodeId`, `styleId`)
- `create_paint_style` — create color style (`name`, `color`, `opacity?` — or `paints`, a full array; `description?`)
- `create_effect_style` — create effect style (`name`, `effects`, `description?`)
- `delete_style` — delete a local style (`styleId`); nodes keep their look, lose the link

**Sizing, rotation & blend:**
- `set_sizing` — layout sizing mode (`nodeId`, `axis`, `mode: FIXED|HUG|FILL`)
- `set_min_max_size` — min/max dimensions (`nodeId`, `minWidth?`, `maxWidth?`, `minHeight?`, `maxHeight?`)
- `set_blend_mode` — blend mode (`nodeId`, `blendMode`)
- `rotate` — rotation in degrees (`nodeId`, `angle`)
- `set_constraints` — layout constraints (`nodeId`, `horizontal?`, `vertical?` — an omitted axis is kept) — values: `MIN|MAX|STRETCH|CENTER|SCALE`, or the panel names `LEFT|RIGHT|LEFT_RIGHT` / `TOP|BOTTOM|TOP_BOTTOM`. Returns a `warning` when they won't act: a child in auto-layout flow (make it `ABSOLUTE` first), a node directly on a page or in a section. Groups have none — set them on the group's children (they follow the nearest frame). Layers inside an instance can't override them — edit the main component
- `get_constraints` — read constraints (`nodeId`)
- `set_layout_positioning` — auto-layout flow (`nodeId`, `positioning: AUTO|ABSOLUTE`)
- `set_corner_radii` — individual corner radii (`nodeId`, `topLeft?`, `topRight?`, `bottomRight?`, `bottomLeft?`)

**Text:**
- `set_text_auto_resize` — text overflow mode (`nodeId`, `mode: NONE|HEIGHT|WIDTH_AND_HEIGHT|TRUNCATE`)

**Boolean operations:**
- `boolean_operation` — combine shapes (`nodeIds`, `operation: UNION|INTERSECT|SUBTRACT|EXCLUDE`, `name?`)

**Fills stack:**
- `set_fills` — replace entire fills array (`nodeId`, `fills`)
- `add_fill` — append a fill (`nodeId`, `fill`)
- `remove_fill` — remove fill by index (`nodeId`, `index?`)

**Strokes stack:**
- `set_strokes` — replace entire strokes array (`nodeId`, `strokes`)
- `add_stroke` — append a stroke (`nodeId`, `stroke`)
- `remove_stroke` — remove stroke by index (`nodeId`, `index?`)
- `set_stroke_dash` — dash pattern (`nodeId`, `dashPattern: [dash, gap, ...]`) — `[]` resets to solid

**Export:**
- `export_svg` — export node as SVG string (`nodeId`)
- `export_node` — any format (`nodeId`, `format: PNG|JPG|SVG|PDF`, `scale?` or `width?` / `height?`, `svgOutlineText?`, `svgIdAttribute?`, `contentsOnly?`, `useAbsoluteBounds?`) → base64 (+ `svg` text)
- **`saveTo`** (an absolute path, a parameter of `figma` / `figma_batch` — or of the HTTP body) writes the result to disk and answers with `savedTo` instead of the payload: base64 results (`export_node`, `get_image`, `get_screenshot`) as the binary file, anything else as JSON — for big reads to process with a script. Through MCP, PNG / JPG results also come back as images directly, and a result too big for a reply is saved to a temp file automatically (`tooLargeForReply`, `savedTo`, a peek at the first items)

**Component instances:**
- `get_instance_properties` — read current property values on instance (`nodeId`)
- `set_instance_property` — set property values (`nodeId`, `properties: { key: value }`)
- `swap_instance` — swap to different component (`nodeId`, `componentId`)
- `reset_instance` — reset all overrides (`nodeId`)
- `detach_instance` — detach from component (`nodeId`)
- `reset_slot` — restore a slot in an instance to the component's content (`nodeId`); returns `limitViolations`

**Component properties & slots:**
- `get_component_properties` — property definitions (`nodeId` of COMPONENT / COMPONENT_SET)
- `add_component_property` — (`componentId`, `name`, `type: TEXT|BOOLEAN|INSTANCE_SWAP|VARIANT|SLOT`, `defaultValue`, `preferredValues?`, `description?`, `slotSettings?`) → `key`
- `edit_component_property` — rename / change default (`componentId`, `propertyKey`, `name?`, `defaultValue?`, `preferredValues?`, `description?`, `slotSettings?`) → new `key`; the `#ID` suffix is kept, so instance overrides survive
- `delete_component_property` — (`componentId`, `propertyKey`) — destructive, see below
- `set_property_reference` — link a layer to a property (`nodeId`, `references: { characters|visible|mainComponent: key }`)
- `create_slot` — slot in a component, creates its SLOT property too (`componentId`, `name?`, `parentId?` — a frame inside the component, `description?`, `slotSettings?: { minChildren, maxChildren, allowPreferredValuesOnly, stretchChildOnInsert, displayEmptyByDefault }`, `preferredValues?`) → slot node + `propertyKey`
- `combine_as_variants` — (`componentIds`, `name?`, `parentId?`)
- `set_component_meta` — (`nodeId`, `description?` or `descriptionMarkdown?`, `documentationLinks?: [url]`) · `get_component_meta` — incl. `key`, variants (`nodeId` — also an instance → its main)
- `expose_instance` — show a nested instance's properties on the parent component's instances (`nodeId` — nested instance inside a COMPONENT, `exposed?` = true)
- `get_nested_instances` — nested instances of an instance with their ids and property values (`nodeId`, `exposedOnly?`); pass those ids to `set_instance_property` / `swap_instance`
- `get_instance_overrides` — which layers differ from the main component and which fields (`nodeId`)

**Libraries:**
- `get_library_assets` — library (remote) components, styles and variables the file already uses, with `key` and local `id` (`allPages?` = true, `scopeId?`, `includeLocal?`). The Plugin API can't browse a library's components — this is how to find them. To place one that's already used: `create_instance` with its `id` (no import needed)
- `get_library_variables` — enabled library variable collections, or the variables in one (`collectionKey?`)
- `import_variable` (`key`) · `import_style` (`key`) · `import_component` (`key`, `type?: COMPONENT|COMPONENT_SET`, `parentId?` / `instance?` — also place an instance) → local id. When the library isn't published or available to this file, imports fail ("Failed to import…" / "could not find…", or a timeout after 20 s) — then use the local `id`s from `get_library_assets` instead
- `get_component_key` — key of a component / set / instance's main (`nodeId`)

**Creating:**
- `create_frame` — new frame (`name`, `width`, `height`, `x`, `y`, `parentId?`, `fill`, `fillOpacity?`, `cornerRadius`, `clipsContent?`) — if no `fill` is provided, frame is transparent (empty fills)
- `create_rectangle` — rectangle (`name`, `width`, `height`, `x`, `y`, `parentId?`, `fill`, `fillOpacity?`, `cornerRadius?`, `stroke`, `strokeWeight?`)
- `create_ellipse` — ellipse/circle (`name`, `width`, `height`, `x`, `y`, `parentId?`, `fill`, `fillOpacity?`, `stroke`, `strokeWeight?`)
- `create_line` — line (`name`, `x`, `y`, `length`, `rotation`, `parentId?`, `stroke`, `strokeWeight`)
- `create_svg` — icon / illustration from SVG markup → frame of editable vectors (`svg`, `name?`, `x`, `y`, `width?` or `height?` — scales proportionally, `parentId?`). Prefer it over drawing icons from primitives
- `create_polygon` (`pointCount?` = 3) · `create_star` (`pointCount?` = 5, `innerRadius?` 0–1) · `create_vector` (`data` — SVG path, or `paths: [{ data, windingRule? }]`) — all take `name`, `width`, `height`, `x`, `y`, `parentId?`, `fill`, `stroke`, `strokeWeight`
- `flatten` — merge shapes into one vector (`nodeIds`, `name?`) · `outline_stroke` — stroke → filled vector (`nodeId`)
- `create_text` — text layer (`text`, `name?`, `fontSize`, `fontFamily?`, `fontStyle?`, `variationSettings?`, `textWrapStyle?`, `textAlignHorizontal?`, `x`, `y`, `parentId?`, `fill`, `fillOpacity?`)
- `create_component` — blank component (`name`, `width`, `height`, `x`, `y`, `parentId?`)
- `create_instance` — instantiate component (`componentId` — a COMPONENT_SET id gives its default variant, `parentId`, `x`, `y`)
- `create_component_from_node` — convert node to component (`nodeId`, `name?`)
- `duplicate` — clone node (`nodeId`, `x`, `y`)

**Images:**
- `set_image_fill` — fill node with image (`nodeId`, `url`, `base64` or `imageHash` — reuse one already in the file, `scaleMode?: FILL|FIT|CROP|TILE`, `scalingFactor?` for TILE, `rotation?`) → `imageHash`, image `width` / `height`

**Structure:**
- `reparent` — move to new parent (`nodeId`, `newParentId`)
- `create_section` — new section (`name`, `x`, `y`, `width?`, `height?`, `parentId?`)
- `resize_section_to_fit` — wrap a section's children with padding, Figma's "Resize to fit" (`nodeId`, `padding?` = 100)
- `delete_node` — delete (`nodeId`)
- `noop` — internal: what the hub runs in place of a command it holds back in a shared file; echoes `result`
- `batch` — multiple commands in one call (`commands: [{action, ...params}]`); a command may reference an earlier result with `{ "$ref": "<index-or-label>.<path>" }` and be tagged `"as": "<label>"` (see Batching)

Every `create_*` with a `parentId` that doesn't exist (or can't hold children) now fails instead of silently dropping the node on the page. Each tool call is one undo step in Figma (a whole `figma_batch` undoes together). Calls time out after 60 s — pass `timeoutMs` for longer batches (max 10 min). If Figma doesn't finish within that time, the plugin itself answers with where it was stuck (`batch step 14 (create_text)`), stops the rest of the batch and moves on to the next command — steps before that point stay applied, and their results come back in `completed` (with `stoppedAtStep`), so you can continue or clean up without re-reading the canvas.

## Colors

Every color param (`fill`, `stroke`, `color`, COLOR variable values, and `color` inside full paint / effect objects) accepts:

```json
"#3366FF"                              // hex; "#3366FF80" carries alpha
"oklch(62% 0.19 260)"                  // also rgb(), hsl(), lab() — any CSS color
{ "space": "OKLCH", "l": 0.62, "c": 0.19, "h": 260 }   // SRGB | DISPLAY_P3 | HSL | HSB | OKLAB | OKLCH
{ "r": 0.2, "g": 0.4, "b": 1 }         // normalized floats 0–1, not 0–255
```

Prefer hex / CSS strings — no 0–1 arithmetic, and Figma keeps the authored color space (OKLCH stays editable as OKLCH). An explicit `opacity` / `fillOpacity` overrides alpha in the string. For `set_effect` shadows, a string keeps its own alpha (`"#0000001A"`), while an `{r,g,b}` object defaults to 0.15.

<!-- rules -->

# Working rules

## Design defaults

Two defaults apply to everything you create, unless the designer says otherwise.

### 1. Responsive by default

Every mockup you build must be **responsive in Figma** — it should reflow when its frame is resized, the way a real CSS layout does. This is not optional.

- **Auto-layout everywhere.** Every container frame gets `set_layout` (`HORIZONTAL` / `VERTICAL`). Avoid absolutely-positioned children unless an element genuinely floats (badge, overlay, FAB) — then use `set_layout_positioning ABSOLUTE` + `set_constraints` (e.g. a badge pinned top-right: `horizontal: RIGHT, vertical: TOP`). Constraints only act on absolute children and on children of non-auto-layout frames; inside auto-layout flow use `set_sizing` and alignment.
- **Choose sizing modes deliberately** (`set_sizing`, axis `horizontal` / `vertical` / `both`):
  - `FILL` — stretches to fill the parent (like `width: 100%`). Sections, columns, grid cards, inputs in a form row.
  - `HUG` — wraps its content (like `width: fit-content`). Buttons, tags, labels, inline elements.
  - `FIXED` — explicit size that doesn't change. Icons, avatars, fixed sidebars.
- **Constrain fluid elements:** modals / drawers / dialogs → `FILL` width + `set_min_max_size maxWidth`; full-page sections → `FILL` both axes.
- **Top-level screen frame:** realistic viewport width (e.g. 1440 / 390), `FIXED` width, vertical auto-layout, `HUG` or `FIXED` height — its children `FILL` the width so the whole screen reflows.
- Do not default to `HUG` for everything — `FILL` is the most common case in real layouts.

**Auto-layout gotchas (these silently break responsiveness):**
- `set_sizing FILL` only works when the **parent already has auto-layout** — set the parent's `set_layout` first, then set children to `FILL`.
- A `HUG` parent collapses `FILL` children to zero width/height — a `FILL` child needs a parent that is `FILL` or `FIXED` on that axis.
- `resize` resets a frame's sizing modes to `FIXED`. Apply `FILL` / `HUG` via `set_sizing` **after** any `resize`, never before.
- `counterAxisAlignItems` does not accept `STRETCH` — to stretch children across the counter axis, set each child to `FILL` on that axis individually.

### 2. Styling — your call, unless the designer sets rules

When the designer has **not** specified visual rules, choose colors, typography, spacing and radii yourself with good taste — ship a clean, modern, coherent look. Don't ask "what colors?" for a quick mockup; just make it good.

The moment the designer **does** name a system — "use the existing components", "use our library / tokens", "match this brand", "stick to the design system" — follow it strictly:
- Reuse existing components via `create_instance` instead of drawing new ones (`get_local_components` first; for a team library, `get_library_assets` — its `id`s go straight into `create_instance`).
- Icons come from the library / file when they exist; otherwise `create_svg` — never draw icons from rectangles and ellipses.
- Bind existing variables / tokens (see Variables usage policy) and apply existing text styles via `apply_text_style`.
- Never invent new tokens or one-off colors while a system is in force.

Rule of thumb: **free styling by default, strict adherence the moment a system or brand is named.**

### Images

- Do not try to set real images unless explicitly provided.
- Use a placeholder frame with a gray fill and fixed dimensions instead.
- Name it clearly: `Image placeholder`, `Avatar placeholder`, `Cover image`, etc.

## Variables usage policy

When creating or editing elements, always check for existing variables first via `get_variables`.

- **If no variables exist at all and the task would benefit from tokens** — ask the user: *"No variables found. Should I create tokens or use hardcoded values?"*
- **If the user just wants a quick mockup** — hardcode everything, no need to ask
- **If a design system exists and is still scaling** (e.g. spacing scale has gaps, new breakpoints being added) — create missing variables that logically extend the system, no need to ask
- **If a design system is finalized** — always ask before introducing any new variable: *"This value has no matching token. Should I create one or use the closest existing variable?"* Prefer rounding to the nearest existing token over creating a new one

When creating tokens, keep two layers: primitives hold raw values (`color/blue/500`), semantic tokens alias them per mode (`bg/primary` → `{ "alias": "color/blue/500" }` in Light, `color/blue/300` in Dark). Bind nodes to semantic tokens, not primitives. Check the final value with `resolve_variable`.

The goal: use the design system when it exists, don't invent one unless asked. Introducing unnecessary variables pollutes the token namespace and breaks consistency.

### Binding variables — applies to ALL nodes, not just components

After creating or editing **any** node (frame, section, component, container), immediately bind matching variables via `apply_variable`. This is not optional and not limited to components — every auto-layout frame, card, and shape must use tokens wherever they exist.

**Color variables** → bind to `fills` and `strokes` on any node with a solid fill or stroke.

**Spacing variables** → bind to every layout property on auto-layout frames:
- `paddingTop`, `paddingBottom`, `paddingLeft`, `paddingRight` — all four, individually
- `itemSpacing` — the gap between children

**Radius variables** → bind to `cornerRadius` on every node that has rounded corners (cards, buttons, inputs, pills, badges, etc.).

**Matching rule:** pick the closest variable value. If the current pixel value doesn't exactly match any token, round to the nearest one and update the node value — design system compliance takes priority over pixel-perfect matching of original intent.

**Workflow — apply right after setting the value, not as an afterthought:**
1. Set the hardcoded value (e.g. `set_layout gap=16`, `set_corner_radius radius=24`)
2. Immediately follow with `apply_variable` for each property that has a matching token
3. Do not defer variable binding to a "cleanup pass" at the end — bind as you build

**What to bind — full property list:**

| Variable type | Properties to bind |
|--------------|-------------------|
| Color | `fills`, `strokes`, `effects` (`field: color`) |
| Spacing | `paddingTop`, `paddingBottom`, `paddingLeft`, `paddingRight`, `itemSpacing`, `gridRowGap`, `gridColumnGap` |
| Radius | `cornerRadius` |
| Effects | `effects` with `field`: `radius`, `spread`, `offsetX`, `offsetY` |
| Typography | TEXT nodes or text styles: `fontSize`, `lineHeight`, `letterSpacing`, `fontFamily`, `fontWeight` |

**Text styles** — same rule applies. After `create_text` or when editing existing text:
- Check `get_local_styles` for available text styles
- Apply the closest matching style via `apply_text_style` (`nodeId`, `styleId`)
- Applying a style sets font, size, line-height, and letter-spacing in one step — always prefer it over setting properties individually
- For components: apply the style to the base component's text node — it propagates to all instances automatically

## Batching — as few round-trips as possible

**Use `figma_batch` whenever you make more than one change.** The goal is to complete any design task in the minimum number of calls — ideally 2–3 total, regardless of complexity.

```json
figma_batch { "commands": [
  { "action": "set_text", "nodeId": "123:1", "text": "Hello" },
  { "action": "set_fill", "nodeId": "123:2", "color": "#FF0000" },
  { "action": "scroll_to_node", "nodeId": "123:1" }
] }
```

### Referencing earlier results — `$ref` (create + style in ONE batch)

A command's params can reference an earlier command's result, so you can create a node and use its ID later in the **same** batch — no second round-trip. Use the object marker `{ "$ref": "<index-or-label>.<path>" }`:

- **By index:** `{ "$ref": "0.id" }` → the `id` field of command 0's result.
- **By label:** tag a command with `"as": "<label>"`, then `{ "$ref": "<label>.id" }`.
- Works anywhere in params, including inside arrays (e.g. `set_selection` → `nodeIds`).
- A bad ref fails only that one command (returns `{ error }`); the rest of the batch still runs.

```json
figma_batch { "commands": [
  { "action": "create_frame", "as": "card", "name": "Card", "width": 320, "height": 200, "parentId": "5:1" },
  { "action": "create_text",  "text": "Title", "parentId": { "$ref": "card.id" } },
  { "action": "set_layout",   "nodeId": { "$ref": "card.id" }, "mode": "VERTICAL", "gap": 12, "padding": 16 }
] }
```

### Execution model — one batch wherever possible

`$ref` removes the old reason to split work into passes (unknown IDs). Build the **whole** hierarchy and style it in a single batch: create each node with `as`, parent children via `parentId: { "$ref": "..." }`, then apply fills / text / layout / variables in the same or later commands using `$ref`.

Only split into a second call when a later command needs a value **Figma computes** and you can't predict — final positions/sizes after auto-layout, or a bounding box you must read back with `get_tree` first. Then batch 1 builds, you read what you need, batch 2 corrects.

**Screenshot last** (`figma_screenshot`, one call): a single screenshot at the very end to verify. Do not screenshot after each section or step.

So a complex screen — 30 nodes, layout, 50 variable bindings, 20 text overrides — is typically **one build batch + one screenshot**, not three passes.

### Known API gotchas (do not repeat these mistakes)

- **`counterAxisAlignItems` does NOT accept `"STRETCH"`** — valid values: `MIN | MAX | CENTER | BASELINE`. To make children fill the counter axis, set `set_sizing` with `axis=horizontal, mode=FILL` on each child individually.
- **`create_frame` without `fill` is now transparent** (fixed in plugin) — but always pass `fill` explicitly if a background color is intended, never rely on defaults.
- **`set_text` does NOT work on INSTANCE nodes** — use `set_instance_property` with the full property key (e.g. `"Label#2044:0"`). Get keys via `get_instance_properties` first, or reuse keys from previous calls on the same component type.
- **Fixed-size frames inside auto-layout must have `primaryAxisSizingMode = 'FIXED'` and `counterAxisSizingMode = 'FIXED'`** — if you create a frame with `layoutMode` set and then call `resize(w, h)`, auto-layout will still shrink it to fit content. Always set both sizing modes to `'FIXED'` before `resize()` on any frame that must hold a specific size (circles, icons, avatars).
- **`set_layout` failures are partial** — if one property in a `set_layout` call throws (e.g. invalid `counterAlign`), properties set before the error DO apply, those after do NOT. Order the properties in `set_layout` to put safe ones first.
- **Coordinates of nodes inside Figma Sections are RELATIVE to the section**, not absolute page coordinates — and sections don't auto-resize to fit their children. Use `create_section` to make one and `resize_section_to_fit` (`nodeId`, `padding`) for Figma's native "Resize to fit" — it reflows the children to the padding and wraps the section around them without moving them on the canvas. Keep section children at small relative coordinates.

### Rules to enforce this

- **Always use `parentId` when creating nodes.** All `create_*` actions support `parentId` — pass it to place the node directly in its parent, eliminating the need for a separate `reparent` pass entirely. Creating nodes at the page level and then reparenting is always unnecessary.
- **Plan structure, not values.** Before executing, decide the node hierarchy and which operations are sequential vs. parallel. Do NOT pre-calculate pixel coordinates, spacing values, or variable IDs in your head — read them from Figma instead. Mental arithmetic is slow and error-prone; a `get_tree` or `get_variables` call is faster and always correct.
- **Prefer read → correct over pre-calculate.** If you're unsure about a position, size, or order: create it approximately, take a screenshot or get_tree, then fix with a targeted batch. This is faster than computing the perfect values upfront.
- **Don't over-plan internally before writing code.** Write the first reasonable script and execute it — don't deliberate over layout details (step indicator structure, spacing edge cases, etc.) in your head before running. Internal deliberation adds wall-clock time just like extra API calls. If the result looks wrong, fix it from the screenshot in 30 seconds.
- **Never make a call just to inspect state you already know.** If you just created a frame, you know its structure — don't `get_tree` to confirm it.
- **Apply variables in the same batch as creation** (reference the new node with `$ref`) — not in a later cleanup round.
- **No mid-build screenshots.** Only screenshot at the end, or when something clearly went wrong and you need to diagnose it visually.
- **Avoid re-reading variable IDs.** Call `get_variables` once at the start of the task. Cache the IDs mentally and reuse them throughout all batches.
- **Never split a batch just for an unknown ID — use `$ref`.** Only split when a later command needs a value Figma computes (positions/sizes after layout).

## Visual hierarchy and spacing

Within a single container, **don't use one uniform gap for everything**. Spacing communicates grouping — related items sit closer together, unrelated sections sit further apart.

When a layout contains logically distinct groups (e.g. header, form fields, action buttons), wrap each group in its own section frame and set spacing at two levels:

- **Inter-section gap** (on the parent container): larger — typically 32–48px
- **Intra-section gap** (within each section frame): smaller — typically 12–20px

**Example — auth form:**
```
Form Card  [gap: 40px]
├── Header Section  [gap: 8px]   ← title + subtitle sit tight
├── Fields Section  [gap: 16px]  ← inputs stay close (they're one task)
└── Actions Section [gap: 12px]  ← buttons + footer
```

**When to split into sections:**
- Content has multiple distinct purposes (identity vs. input vs. action)
- A uniform gap makes the layout feel flat or undifferentiated
- Design needs visual breathing room between groups but not within them

Always ask: *does the same gap make sense between every pair of adjacent elements?* If not, group and apply different gaps.

## Component design

Components must be built for reuse — not as frozen snapshots of one screen.

### Text properties

Every piece of text that changes across instances must be a component property:

| Text in component | Property to add | Default value |
|-------------------|-----------------|---------------|
| Button label | `Label` (TEXT) | `"Button"` |
| Input label | `Label` (TEXT) | `"Label"` |
| Input placeholder | `Placeholder` (TEXT) | `"Placeholder"` |
| Card title | `Title` (TEXT) | `"Title"` |
| Badge / tag text | `Label` (TEXT) | `"Label"` |

The text node inside the component must stay as a **generic placeholder** — never the actual value used in the screen. Override happens on the instance, not in the component itself.

**Workflow:**
1. `add_component_property` — add TEXT property with generic default (`componentId`, `name`, `type: "TEXT"`, `defaultValue`)
2. `set_property_reference` — link the text layer to the property key returned in step 1 (`nodeId` of the text layer, `references: { characters: "<key>" }`)
3. On instances, override with `set_text` on the specific child node

### Variants

Related components (e.g. button styles, input states, card types) must be grouped into a **single COMPONENT_SET** with a `Variant` property — not left as separate top-level components.

**Workflow:**
1. Name each component with the variant encoding before combining: `"Variant=Primary"`, `"Variant=Secondary"`, etc. (use `rename`)
2. Call `combine_as_variants` with all component IDs and the shared name (e.g. `"Button"`)
3. After combining, add shared properties (Label, etc.) to the COMPONENT_SET

**Naming convention for variant property values:** use PascalCase — `Primary`, `Secondary`, `Default`, `Active`, `Error`, etc.

### Variables on components

The same variable binding rules from "Variables usage policy" apply to components — `cornerRadius`, `paddingTop/Bottom/Left/Right`, `itemSpacing`, `fills`, `strokes`. Bind them immediately when building the component, before converting to a component set or adding instances to the canvas.

### Updating an existing component

When adding variants or properties to an existing COMPONENT_SET:
1. Read current state: `get_children` on the component set + `get_component_properties`
2. Build the new variant frame, convert with `create_component_from_node`
3. Add it to the existing set with `reparent` (`newParentId` = the set ID) — NOT `combine_as_variants`, which always creates a new set and fails with a set as parent. Then `move` it into place: the set has no auto-layout and keeps the child's old x/y
4. Add new shared properties via `add_component_property` on the set if needed
5. Existing instances on screens **inherit updates automatically** — no need to touch them unless the property keys changed
6. Update `design.md` with new variant IDs and any changed property keys

**After `combine_as_variants`**, apply the component-set styling via bridge actions — the API does not add it automatically:
1. `set_strokes` on the set: one SOLID stroke in Figma's variant purple `{ r: 0.541, g: 0.220, b: 0.961 }`
2. `set_stroke` weight `1`, align `INSIDE`
3. `move` each child variant to `x=20`, stacking `y` by previous heights + ~30px gaps (the set has no auto-layout)
4. `resize` the set to `pad + widest child + pad` × total height

**Renaming a component property:** use `edit_component_property` with `name` — the internal `#ID` is preserved, so instances keep their overrides. Record the returned key in `design.md`.

**Deleting a property** is destructive — all instance overrides for that property are permanently lost. If you need to replace a property: add the new one first, update all instances manually, then delete the old one.

### Component placement

All components live in a dedicated Section named `Components` on the same page as the screens. Its ID is stored in `design.md`.

**Layout rules:**
- Components are grouped by type: `Forms`, `Actions`, `Navigation`, `Icons`, etc.
- Within a group: `40px` gap between components
- Between groups: `80px` gap
- Group label (Label/SM, gray/400) sits `8px` above each group's components
- Top padding: `60px` (section header space), left/right: `40px`, bottom: `40px`
- After adding padding/stroke to a component set, always check neighbors don't overlap — resize section after every change

**When creating a new component:**
1. Determine which group it belongs to (Forms / Actions / Navigation / Icons / …)
2. Place it inside the correct group with `40px` gap to the previous component in that group
3. If it's a new group, add a group label text node and `80px` gap from the previous group
4. Resize the section: `section.resizeWithoutConstraints(newWidth, newHeight)`
5. Record the component in `design.md`

Never place components loose on the page or inside screen frames. Never use emoji in node names — use plain text only.

### After creating a component or style

Update `{{NOTES_DIR}}/{fileKey}/design.md` immediately:
- **New component / component set** — add its ID and all property keys (from `add_component_property` responses)
- **New variant** — add variant ID read from `componentSet.children`, never guessed
- **New text style** — add its name and style ID
- **New effect style** — add its name and style ID

**Always verify IDs before writing to design.md.** Never guess or infer node IDs — read them from the API response or via `get_children`. Guessed IDs will silently point to the wrong node.

## Per-project design notes

Each Figma project has a private `design.md` at:
```
{{NOTES_DIR}}/{fileKey}/design.md
```

The folder sits in the Claude Bridge repo and is git-ignored (private). Bound to the Figma **file key** (not project name) — survives renames.

**Finding the file key:** `get_file_info` returns `fileKey`, but it is `null` for a development plugin like this one. Take the key from a figma.com URL the user gave (`figma.com/design/<fileKey>/…`); otherwise match `get_file_info.fileName` against the `Figma file name:` line of each `{{NOTES_DIR}}/*/design.md`. No match → ask the user for the file's URL before creating a new `design.md`. Every `design.md` starts with both lines — `Figma file key:` and `Figma file name:`.

**At the start of any Figma session:** check if the file exists and read it for project conventions before touching the canvas.

**Update the file when:**
- A new design decision is made (panel sizes, spacing choices, component patterns)
- A new screen is added (update the screen map)
- A new component or component set is created — add its ID and all property keys
- A new text style or effect style is created — add its ID
- A convention changes or is refined

**Rules to prevent bloat:**
- Max ~60 lines — prune stale or redundant entries when the file grows
- Only document decisions made by the designer, not current Figma state (positions and IDs are read live)
- Variable collection IDs are worth keeping — they don't change and save a `get_variables` parse

## Screen layout on the canvas

### Rule #1 — detect the existing pattern first

Before placing any new screen, call `get_page_nodes` and analyse what's already there:
- **Naming** — what convention is used? (`Auth / Desktop`, `Onboarding/Step 1`, `dashboard-mobile`, etc.)
- **Axis** — are screens arranged horizontally (varying x, same y) or in rows (varying both)?
- **Gaps** — measure the space between existing frames (x2 - x1 - width1)
- **Grouping** — are there Figma Sections? Are viewport variants side-by-side or stacked?

**Match that pattern exactly.** Do not impose a new layout scheme on a file that already has one.

### Rule #2 — default layout for new projects (no pattern yet)

When the canvas is empty or has only one screen, use this structure:

```
Row per flow, flows stacked vertically:

  ┌─────────────────────────────────────────────┐  ← Figma Section "Auth"
  │ [Desktop 1440]  [Mobile 390]  [Tablet 1024] │
  └─────────────────────────────────────────────┘

  ┌─────────────────────────────────────────────┐  ← Figma Section "Register"
  │ [Desktop 1440]  [Mobile 390]  [Tablet 1024] │
  └─────────────────────────────────────────────┘
```

- Gap between screens within a row: **200px**
- Gap between rows (flows): **400px**
- All screens in a row share the same **y = 0** (top-aligned)
- Naming: `Flow / Viewport` — e.g. `Auth / Desktop`, `Auth / Mobile`

### Rule #3 — adding a screen to an existing file

1. `get_page_nodes` — read current positions and names
2. Identify which row (flow) the new screen belongs to
3. Place it at `x = rightmost_screen_in_that_row + width + gap`, same `y` as that row
4. Match the existing naming convention — do not invent a new one
5. Update `design.md` screen map with the new position

### Rule #4 — viewport variants

When adding a mobile/tablet variant of an existing desktop screen:
1. Read the desktop screen structure (`get_tree`) — don't rebuild from memory
2. Adapt layout: adjust panel widths, font sizes, spacing to fit the new viewport
3. Reuse the same component instances — don't recreate components
4. Place it to the right of the desktop screen in the same row (same y)
5. Update `design.md` screen map

## Accessibility

Run `audit_contrast` only when explicitly requested — not automatically after creating screens. Use `scopeId` (not `nodeId`) to scope the check.

## Typical workflow

1. **Read `design.md`** for the active Figma project before any Figma operation
2. `get_selection` or `get_page_nodes` — understand what's on the canvas
3. `find_nodes` — locate specific elements by name, text, or type
4. `get_tree` — inspect structure of a specific node if needed
5. Make targeted edits with specific actions
6. Use `batch` for multiple changes at once
7. **`scroll_to_node`** — always scroll to the result at the end so the user sees it
