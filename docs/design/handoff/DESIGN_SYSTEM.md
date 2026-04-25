# Myika for Unreal — Design System

**Version:** 0.1 (V1 scope)
**Audience:** engineering, implementing the client
**Status:** source of truth. HTML reference renders must match these tokens exactly.

All visual values in the product — colors, sizes, spacings, radii, motion — come from this document. If a value is needed that is not in this document, add it here first, then use it. No magic numbers.

Dark mode only in V1. Light mode tokens will be added when they exist.

---

## 1. Color tokens

CSS custom property pattern: `--color-<category>-<role>[-<variant>]`.

### 1.1 Backgrounds

| Token | Hex | Usage |
|---|---|---|
| `--color-bg-base` | `#0A0A0A` | App root. Outer canvas behind everything. |
| `--color-bg-surface` | `#141414` | Primary surface — chat panel, settings pane body, onboarding card body. |
| `--color-bg-elevated` | `#1C1C1C` | Elevated surface — tool-call card, plan card, permission modal body, list-row hover. |
| `--color-bg-raised` | `#242424` | Raised surface — chip fills, kbd chips, code blocks inside cards. |
| `--color-bg-overlay` | `rgba(0, 0, 0, 0.60)` | Modal backdrop (behind decision/confirm/alert modals). |
| `--color-bg-accent-soft` | `rgba(74, 222, 128, 0.08)` | Accent tint — plan-card header bg, connected onboarding step bg. |
| `--color-bg-danger-soft` | `rgba(248, 113, 113, 0.08)` | Danger tint — tool failure card bg, bridge-lost modal accent bg. |

### 1.2 Borders

| Token | Value | Usage |
|---|---|---|
| `--color-border-subtle` | `rgba(255, 255, 255, 0.06)` | Intra-card dividers, row separators, dashed internal lines. |
| `--color-border-default` | `rgba(255, 255, 255, 0.10)` | Card outer border, input border, button outline. |
| `--color-border-strong` | `rgba(255, 255, 255, 0.16)` | Hovered/focused controls, elevated modal outline. |
| `--color-border-accent` | `#4ADE80` | Active nav item indicator, primary button border, focus ring. |
| `--color-border-danger` | `#F87171` | Destructive button, failure card outline, bridge-lost modal outline. |

### 1.3 Text

| Token | Hex | WCAG vs `bg-surface` (#141414) | Usage |
|---|---|---|---|
| `--color-text-primary` | `#E5E5E5` | 12.5:1 AAA | Body copy, headings, primary chat text. |
| `--color-text-secondary` | `#A3A3A3` | 6.2:1 AA | Secondary labels, hints, timestamps. |
| `--color-text-muted` | `#737373` | 3.6:1 (large text only) | Meta, captions, placeholder text. |
| `--color-text-disabled` | `#525252` | 2.0:1 (non-interactive) | Disabled buttons, ghosted actions. |
| `--color-text-accent` | `#4ADE80` | 9.1:1 AAA | Status "connected", success messages, accent-linked text. |
| `--color-text-on-accent` | `#0A0A0A` | — | Text on solid accent fills (primary button label). |
| `--color-text-danger` | `#F87171` | 5.1:1 AA | Error messages, destructive button labels. |
| `--color-text-warning` | `#FBBF24` | 8.5:1 AAA | Warning copy, caution pills. |

### 1.4 Accent (phosphor green)

Single accent. Muted sage-phosphor. Never use #00FF00.

| Token | Hex | Usage |
|---|---|---|
| `--color-accent-default` | `#4ADE80` | Primary button fill, accent border, live status dot. |
| `--color-accent-hover` | `#5EEB91` | Primary button hover. |
| `--color-accent-active` | `#3BC26D` | Primary button pressed. |
| `--color-accent-soft` | `rgba(74, 222, 128, 0.08)` | See bg-accent-soft. |
| `--color-accent-ring` | `rgba(74, 222, 128, 0.35)` | Focus ring (2px). |

### 1.5 Status

Each status has `default` / `hover` / `soft` (for background tinting).

| Status | Default | Hover | Soft | Usage |
|---|---|---|---|---|
| success | `#4ADE80` | `#5EEB91` | `rgba(74,222,128,0.08)` | "Connected", plan complete, valid input. |
| warning | `#FBBF24` | `#FCD34D` | `rgba(251,191,36,0.08)` | "Will ask" pills, retry countdowns, caution. |
| danger | `#F87171` | `#FCA5A5` | `rgba(248,113,113,0.08)` | Tool failure, bridge lost, destructive actions. |
| info | `#60A5FA` | `#93C5FD` | `rgba(96,165,250,0.08)` | Neutral notifications (not used heavily in V1). |
| neutral | `#A3A3A3` | `#D4D4D4` | `rgba(163,163,163,0.08)` | Idle state, muted pills. |

### 1.6 Code / syntax highlighting

Used inside `<code>` blocks in tool args, plan card diffs, etc. Prism-compatible class names.

| Token | Hex | Maps to |
|---|---|---|
| `--color-syntax-plain` | `#E5E5E5` | default text |
| `--color-syntax-keyword` | `#C084FC` | `if`, `for`, `return`, `def`, `class` |
| `--color-syntax-string` | `#86EFAC` | `"strings"` |
| `--color-syntax-number` | `#FBBF24` | numeric literals |
| `--color-syntax-comment` | `#737373` | `# comments` |
| `--color-syntax-function` | `#60A5FA` | function names |
| `--color-syntax-property` | `#5EEAD4` | object keys, component props |
| `--color-syntax-operator` | `#A3A3A3` | `=`, `+`, `→` |

### 1.7 Diff colors

| Token | Hex | Usage |
|---|---|---|
| `--color-diff-added` | `#4ADE80` | `+` marker, added file, inserted line |
| `--color-diff-added-bg` | `rgba(74,222,128,0.06)` | inserted line background |
| `--color-diff-removed` | `#F87171` | `−` marker, removed line |
| `--color-diff-removed-bg` | `rgba(248,113,113,0.06)` | removed line background |
| `--color-diff-modified` | `#FBBF24` | `~` marker, changed file |

---

## 2. Typography

Two families only. Caveat is removed in production.

| Family | Font | Fallback stack |
|---|---|---|
| `--font-ui` | Inter | `'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif` |
| `--font-mono` | JetBrains Mono | `'JetBrains Mono', 'SF Mono', Menlo, Consolas, monospace` |

All Inter usage should enable OpenType features: `font-feature-settings: 'ss01', 'cv11';` for taller, more-geometric forms.

### 2.1 Type scale

Sizes in px. Line-height is unitless multiplier. Weights: 400 regular, 500 medium, 600 semibold.

| Token | Family | Size | Weight | LH | LS | Usage |
|---|---|---|---|---|---|---|
| `--text-display` | ui | 28 | 600 | 1.2 | -0.02em | Onboarding step title. |
| `--text-heading-1` | ui | 20 | 600 | 1.3 | -0.01em | Settings section title, modal title. |
| `--text-heading-2` | ui | 16 | 600 | 1.35 | -0.005em | Subsection title, card header. |
| `--text-heading-3` | ui | 14 | 600 | 1.4 | 0 | List-group header, plan card header. |
| `--text-body-large` | ui | 14 | 400 | 1.55 | 0 | Primary chat message text. |
| `--text-body` | ui | 13 | 400 | 1.5 | 0 | Default body, button labels. |
| `--text-body-small` | ui | 12 | 400 | 1.5 | 0 | Secondary text in cards. |
| `--text-label` | ui | 12 | 500 | 1.4 | 0 | Form labels, row labels. |
| `--text-caption` | ui | 11 | 400 | 1.4 | 0 | Hint text under form rows. |
| `--text-meta` | ui | 10 | 500 | 1.3 | 0.02em | Small-caps section tags ("TOOL", "ARGUMENTS"), uppercase. |
| `--text-mono-large` | mono | 13 | 400 | 1.5 | 0 | Tool args block, code block primary. |
| `--text-mono` | mono | 12 | 400 | 1.5 | 0 | Inline code, tool names, chip labels. |
| `--text-mono-small` | mono | 11 | 400 | 1.4 | 0 | Timestamps, ports, hashes, status line in bottom bar. |
| `--text-mono-micro` | mono | 10 | 500 | 1.3 | 0.02em | Kbd chips, capability badges. |

### 2.2 Chat-specific

| Style | Tokens |
|---|---|
| User message | `--text-body-large`, `--color-text-primary` |
| Assistant message | `--text-body-large`, `--color-text-primary` |
| Tool name (chip) | `--text-mono`, `--color-text-primary` |
| Tool args | `--text-mono-large`, `--color-syntax-plain` |
| Tool result | `--text-mono-large`, `--color-text-secondary` |
| Message timestamp | `--text-mono-small`, `--color-text-muted` |
| Plan step body | `--text-body`, `--color-text-primary` |

---

## 3. Spacing scale

Base unit: **4px**. All spacing values MUST come from this scale.

| Token | Value | Typical use |
|---|---|---|
| `--space-0` | 0 | reset |
| `--space-1` | 4 | tightest gap (icon↔text inside chip) |
| `--space-2` | 8 | intra-row gap |
| `--space-3` | 12 | card internal padding (sm) |
| `--space-4` | 16 | default card padding, modal body padding |
| `--space-5` | 20 | between form rows |
| `--space-6` | 24 | settings pane padding, section gap |
| `--space-8` | 32 | onboarding card padding |
| `--space-10` | 40 | large layout gap |
| `--space-12` | 48 | hero/empty-state vertical padding |
| `--space-16` | 64 | max padding, never exceed |

Avoid odd values (6, 10, 14). If you need them, step to the nearest scale value.

---

## 4. Border radius

| Token | Value | Usage |
|---|---|---|
| `--radius-none` | 0 | sharp edges — none in V1 (everything is at least subtle) |
| `--radius-sm` | 2px | kbd chips, capability badges, diff markers |
| `--radius-md` | 4px | buttons, inputs, tool chips, segmented controls |
| `--radius-lg` | 6px | cards (tool call, plan, failure) |
| `--radius-xl` | 8px | modals, onboarding card |
| `--radius-full` | 9999px | pulse dot, avatar, state pills |

---

## 5. Shadows / elevation

Dark mode: shadows are mostly replaced by border contrast. Use shadow sparingly — only for floating surfaces (modals, popovers).

| Token | Value | Usage |
|---|---|---|
| `--shadow-none` | none | Default — everything in-flow. |
| `--shadow-sm` | `0 1px 2px rgba(0,0,0,0.40)` | Hover lift on buttons / cards (subtle). |
| `--shadow-md` | `0 4px 12px rgba(0,0,0,0.50)` | Popovers, dropdowns, tooltips. |
| `--shadow-lg` | `0 12px 32px rgba(0,0,0,0.60), 0 0 0 1px rgba(255,255,255,0.04)` | Modals (permission, confirm, alert, onboarding). The inner 1px ring compensates for dark-on-dark. |
| `--shadow-glow-accent` | `0 0 0 3px rgba(74,222,128,0.20)` | Live pulse dot glow. |

---

## 6. Motion

### 6.1 Duration

| Token | Value | Usage |
|---|---|---|
| `--motion-instant` | 0ms | State changes that should not animate (radio tick). |
| `--motion-fast` | 100ms | Hover color, segmented control slide, chip expand. |
| `--motion-default` | 150ms | Modal fade-in, panel slide, button press. |
| `--motion-slow` | 250ms | Onboarding step transition, plan card reveal. |
| `--motion-pulse` | 1800ms | Pulse dot breathing loop. |
| `--motion-typing` | 1300ms | Typing-dot loop. |

### 6.2 Easing

| Token | Value | Usage |
|---|---|---|
| `--ease-linear` | `linear` | Pulse, typing loops. |
| `--ease-out` | `cubic-bezier(0.16, 1, 0.3, 1)` | Default for entrances. |
| `--ease-in-out` | `cubic-bezier(0.4, 0, 0.2, 1)` | Bidirectional (modal open/close). |

### 6.3 Where motion is used

- **Modal enter:** fade + 4px up translate, `--motion-default`, `--ease-out`.
- **Modal exit:** fade only, `--motion-fast`, `--ease-in-out`.
- **Streaming text:** cursor blink at 600ms interval; no character-by-character typing animation (too distracting).
- **Pulse dot:** opacity 0.6→1.0→0.6 loop at `--motion-pulse`, `--ease-linear`.
- **Typing dots:** 3 dots, each offset by 130ms, opacity 0.3→1.0→0.3.
- **State pill color change:** `--motion-fast` on background-color.
- **Reduced motion:** all loops and transitions → 0ms. Pulse → static opacity 0.85.

---

## 7. Component specifications

Every interactive component must implement: rest, hover, pressed, focus, disabled. Additional per-component states called out.

### 7.1 Buttons

All buttons: `--radius-md`, `--space-2 --space-4` padding (8×16), min-height 32px, font `--text-body` weight 500.
Primary actions: 36px height.
Icon-only: 28×28.

| Variant | Rest | Hover | Pressed | Focus | Disabled |
|---|---|---|---|---|---|
| Primary | bg `--color-accent-default`, text `--color-text-on-accent` | bg `--color-accent-hover` | bg `--color-accent-active` | + 2px ring `--color-accent-ring` | bg `--color-bg-raised`, text `--color-text-disabled`, cursor not-allowed |
| Secondary | bg transparent, border `--color-border-default`, text `--color-text-primary` | border `--color-border-strong`, bg `rgba(255,255,255,0.02)` | bg `rgba(255,255,255,0.04)` | + 2px ring `--color-accent-ring` | border `--color-border-subtle`, text `--color-text-disabled` |
| Destructive | bg transparent, border `--color-border-danger`, text `--color-text-danger` | bg `--color-bg-danger-soft` | bg `rgba(248,113,113,0.14)` | + 2px ring `rgba(248,113,113,0.35)` | border `--color-border-subtle`, text `--color-text-disabled` |
| Ghost | bg transparent, border `1px dashed --color-border-default`, text `--color-text-secondary` | text `--color-text-primary` | bg `rgba(255,255,255,0.02)` | + 2px ring | text `--color-text-disabled`, border dashed `--color-border-subtle` |
| Icon-only | bg transparent, icon `--color-text-secondary` | bg `--color-bg-raised`, icon `--color-text-primary` | bg `--color-bg-elevated` | + 2px ring | icon `--color-text-disabled` |
| Segmented | 3-way Allow/Ask/Deny — active segment: bg `--color-accent-default` (allow), `--color-text-secondary` (ask), `--color-border-danger` (deny); inactive: transparent, border `--color-border-default` | bg `rgba(255,255,255,0.03)` on inactive | — | + 2px ring on segment group | opacity 0.5 |

**Loading state (primary/secondary):** swap label for 3-dot loader, keep width stable.

### 7.2 Inputs

All: height 32px (compact) or 36px (default), `--radius-md`, font `--text-body`, padding `--space-2 --space-3`.

| Variant | Rest | Focus | Error | Valid | Disabled |
|---|---|---|---|---|---|
| Text / Password | bg `--color-bg-base`, border `--color-border-default`, text `--color-text-primary`, placeholder `--color-text-muted` | border `--color-border-accent`, ring 2px `--color-accent-ring` | border `--color-border-danger`, ring 2px `rgba(248,113,113,0.35)` | border `--color-accent-default` (no ring) | bg `--color-bg-surface`, text `--color-text-disabled`, cursor not-allowed |
| Textarea | as text, min-height 72px, resize vertical | — | — | — | — |
| Toggle | 28×16 pill, off: bg `--color-bg-raised`, thumb `--color-text-muted`; on: bg `--color-accent-default`, thumb `#0A0A0A` | thumb slide `--motion-fast` | — | — | opacity 0.5 |
| Radio | 14×14, border `--color-border-default` off; border+dot `--color-accent-default` on | + ring | — | — | opacity 0.5 |
| Checkbox | 14×14 `--radius-sm`, empty: border `--color-border-default`; checked: bg `--color-accent-default`, ✓ `#0A0A0A` | + ring | — | — | opacity 0.5 |

### 7.3 Modals & overlays

| Variant | Spec |
|---|---|
| Confirm | width 440, `--radius-xl`, `--shadow-lg`, border `--color-border-default`. Header `--space-4`, body `--space-4`, footer `--space-4` right-aligned buttons. |
| Decision | width 480. Three buttons in footer — primary leftmost for keyboard-default. |
| Alert | width 440, border `--color-border-danger`, left accent 3px danger bar. |
| Onboarding card | width 560 height 440, `--radius-xl`, `--shadow-lg`, progress strip in header. |
| Backdrop | `--color-bg-overlay`, `backdrop-filter: blur(2px)`. |
| Toast | bottom-right, offset `--space-6`, `--radius-lg`, `--shadow-md`, auto-dismiss 4s. |
| Tooltip | `--color-bg-raised`, `--text-mono-small`, `--radius-sm`, `--space-1 --space-2` padding, `--shadow-md`. 150ms delay. |
| Popover | `--color-bg-elevated`, `--radius-lg`, `--shadow-md`, border `--color-border-default`. |

### 7.4 Cards

| Variant | Spec |
|---|---|
| Tool chip (inline) | inline-flex, bg `--color-bg-raised`, border `--color-border-default`, `--radius-md`, padding `--space-1 --space-2`, `--text-mono-small`. Status dot left, 6×6. |
| Tool expanded | bg `--color-bg-elevated`, border `--color-border-default`, `--radius-lg`. Header row + args block (bg `--color-bg-base`) + result block. |
| Plan card | bg `--color-bg-elevated`, border `--color-border-accent`, `--radius-lg`. Header bg `--color-bg-accent-soft`. |
| Failure card | bg `--color-bg-danger-soft`, border `--color-border-danger`, `--radius-lg`. |
| Message bubble (user) | bg `--color-bg-raised`, border `--color-border-subtle`, `--radius-lg`, padding `--space-3 --space-4`, right-aligned. |
| Message bubble (assistant) | bg transparent, no border, left-aligned — reads as prose. |
| List row | padding `--space-2 --space-3`, border-top `--color-border-subtle`, hover bg `rgba(255,255,255,0.02)`. |
| Empty state | centered, `--space-12` vertical padding, display text + chip suggestions. |

### 7.5 Status indicators

| Variant | Spec |
|---|---|
| Pulse dot | 8×8 `--radius-full`. Colors: success/danger/neutral from status scale. Glow: `--shadow-glow-accent` when success+live. |
| Capability badge | `--text-mono-micro` uppercase, padding `--space-1 --space-2`, `--radius-sm`, border `--color-border-default`. Colors: read `--color-text-secondary`, write `--color-text-warning`, exec `--color-text-danger`. |
| State pill | `--text-mono-micro`, padding `0 --space-2`, `--radius-full`, border `--color-border-default`. Variants: running (accent), queued (neutral), skipped (muted), will-ask (warning). |
| Diff marker | `--text-mono`, 1-char width. Colors from §1.7. |
| Progress strip | 4px height, segments `--radius-sm`, gap 4px. Filled = `--color-accent-default`, empty = `--color-border-subtle`. |
| Kbd | `--text-mono-micro`, bg `--color-bg-raised`, border `--color-border-default`, `--radius-sm`, padding `0 --space-1`. |
| Loading dot | 3 × 4px dots, gap 3px, opacity loop 0.3→1.0, staggered 130ms. |

---

## 8. Layout primitives

| Element | Spec |
|---|---|
| Top bar | height 36px, bg `--color-bg-base`, border-bottom `--color-border-subtle`, padding `--space-2 --space-4`. |
| Bottom status bar | height 28px, bg `--color-bg-base`, border-top `--color-border-subtle`, padding `0 --space-4`, font `--text-mono-small`. |
| Side nav (settings) | width 200px, bg `--color-bg-base`, border-right `--color-border-subtle`, padding `--space-5 0`. Active item: bg `--color-bg-surface`, left border 2px `--color-border-accent`. |
| Section header | `--text-heading-1`, subhint `--text-caption --color-text-muted`, margin-bottom `--space-5`. |
| Form row | grid 220px / 1fr, gap `--space-6`, padding `--space-3 0`, border-bottom 1px dashed `--color-border-subtle`. Label left, control right. |
| Composer dock | min-height 56px, bg `--color-bg-surface`, border-top `--color-border-subtle`, padding `--space-3 --space-4`. |
| Divider | 1px solid `--color-border-subtle` (section); 1px dashed `--color-border-subtle` (intra-card). |
| Scroll region | scrollbar: 8px wide, thumb `rgba(255,255,255,0.08)`, hover `0.16`, no track. |
| Main window min | 960×640. Settings min 960×720. |

---

## 9. Accessibility

| Rule | Target |
|---|---|
| Body text contrast | ≥ 4.5:1 (WCAG AA). `--color-text-primary` on `--color-bg-surface` = 12.5:1. `--color-text-secondary` = 6.2:1. |
| Large text contrast (≥18px or 14px bold) | ≥ 3:1. `--color-text-muted` qualifies for 14px+ only. |
| Non-text contrast (borders of interactive controls) | ≥ 3:1. `--color-border-default` on `--color-bg-surface` ≈ 2.8:1 — hovers must bump to `--color-border-strong` (≥ 3.4:1) to pass in hover state. |
| Focus ring | 2px `--color-accent-ring` outside the element, 2px offset. MUST be visible on every interactive element, including buttons, inputs, list items, chips, kbd groups. |
| Hit target | Primary actions ≥ 44×44 including padding. Secondary ≥ 32×32. Icon buttons are 28×28 visually + 8px invisible padding → 36×36 effective. |
| Reduced motion (`prefers-reduced-motion: reduce`) | All transitions → `--motion-instant`. Pulse → static opacity 0.85. Typing dots → static "…" glyph. Modal enter/exit → fade only, no translate. |
| Keyboard | Every action reachable via keyboard. Modal traps focus. Escape closes non-destructive modals. |
| ARIA | Modals get `role="dialog"` + `aria-modal="true"` + labelledby. Toasts `role="status"` or `role="alert"` for danger. |

---

## 10. Naming conventions

CSS custom properties follow `--<category>-<role>[-<variant>]`:

| Category | Pattern | Example |
|---|---|---|
| Color | `--color-<group>-<role>[-<variant>]` | `--color-bg-surface`, `--color-text-accent`, `--color-accent-hover` |
| Type | `--text-<name>` for composite styles; `--font-<family>` for families | `--text-body`, `--font-mono` |
| Space | `--space-<step>` | `--space-4` |
| Radius | `--radius-<name>` | `--radius-md` |
| Shadow | `--shadow-<name>` | `--shadow-lg` |
| Motion | `--motion-<name>`, `--ease-<name>` | `--motion-default`, `--ease-out` |

Composite type tokens resolve to a block of properties — implement as utility class or `@mixin`-equivalent in the framework used. Example:

```css
.text-body {
  font-family: var(--font-ui);
  font-size: 13px;
  font-weight: 400;
  line-height: 1.5;
  letter-spacing: 0;
}
```

Avoid inventing tokens for one-off uses. If a new token is needed, add it to this document under the appropriate section, then reference it by name.

---

## 11. Out of scope for V1

Documented here so the boundary is explicit:

- Light theme.
- Custom keybindings (settings screen shows them read-only).
- Edit-plan-before-run (button present, disabled, labeled "v2").
- History/threads sidebar.
- Secondary windows (logs, diff fullscreen).
- Per-user theme tokens beyond the accent color.

These items will extend §1.4, §8, and §11 respectively when built.
