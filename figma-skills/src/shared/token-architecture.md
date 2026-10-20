### Token tiers

1. **Primitives** — the raw palette and scales (`color/blue/500`, `space/16`). One mode. Not applied to layers directly.
2. **Semantic** — purpose-based aliases of primitives (`color/bg/surface`, `color/text/primary`). They carry the theme modes (Light / Dark) and are what layers get bound to.
<!-- TODO: нужен ли третий уровень — component tokens (`button/bg/default`)? -->
<!-- TODO: правда ли примитивы никогда не применяются к слоям? Исключения? -->

### Collections and modes

<!-- TODO: названия коллекций (Primitives / Semantic? Tokens / Theme?) -->
<!-- TODO: названия режимов (Light / Dark), нужны ли бренды как отдельные режимы или коллекции -->

### Naming

<!-- TODO: разделитель (/), регистр (kebab-case?), только английский? -->
<!-- TODO: шкала цветов: 50–950 или 1–12? -->
<!-- TODO: spacing по значению (space/16) или t-shirt (space/md)? -->
<!-- TODO: группы семантики: bg, text, border, icon, fill… -->

### Scales

<!-- TODO: spacing: 0, 2, 4, 8, 12, 16, 24, 32, 48, 64? -->
<!-- TODO: radius, stroke width, sizes (иконки, контролы) -->
<!-- TODO: type scale: размеры, line-height, веса -->

### Variables vs styles

<!-- TODO: что переменная, а что стиль:
  - цвета → переменные; градиенты → color styles?
  - типографика → text styles, привязанные к переменным?
  - тени/блюры → effect styles
-->
