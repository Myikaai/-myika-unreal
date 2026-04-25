# Myika Unreal — Design Handoff

**For:** Claude Code, implementing the visual layer of Myika Unreal
**Status:** Merged from two design sources. This README is the conflict-resolution authority.

---

## Read order (mandatory)

1. **This README** — explains the structure of this bundle and which source wins on each axis
2. **`DESIGN_SYSTEM.md`** — the spec. Source of truth for tokens, component states, accessibility rules, naming conventions
3. **`reference/figma-make-runnable/DESIGN_NOTES.md`** — explains motion and depth rationale (why 180ms, why HSL hue 142, etc.)
4. **`reference/figma-make-runnable/src/`** — runnable React components demonstrating the signature animations
5. The HTML files (`Production.html`, `Animations.html`, `Icons.html`) — visual reference renders. If they contradict `DESIGN_SYSTEM.md`, the spec wins.

---

## Two design sources, one implementation

This bundle merges work from two design tools. They were intentionally kept both because they're complementary:

- **Claude Design** produced the formal design system — broader component coverage, exhaustive state matrices, custom iconography, accessibility documentation. Stronger on **breadth and rigor**.
- **Figma Make** produced a runnable visual reference — implemented motion, multi-layer shadows, refined HSL accent system, signature animations you can see live. Stronger on **depth and motion craft**.

When they disagree, this README tells you which one wins.

---

## Conflict resolution table

| Concern | Authority | Why |
|---|---|---|
| Token naming convention | **Claude Design** (`DESIGN_SYSTEM.md` §1) | More thorough, defines every category |
| Token *values* (colors, motion, shadows) | **Figma Make** (`reference/figma-make-runnable/src/tokens.css`) | Tuned with explicit rationale (HSL, multi-layer shadows, custom easing) |
| Component state matrices | **Claude Design** (`DESIGN_SYSTEM.md` §7) | More complete |
| Custom icons + logo | **Claude Design** (`icons/sprite.svg`) | Full set with size + status variants |
| Motion implementation reference | **Figma Make** (`reference/figma-make-runnable/src/`) | Actually runnable, can be copied/adapted |
| Bridge indicator (signature pulse) | **Figma Make** (`BridgeIndicator.tsx`) | Implemented correctly with idle/active states |
| Approve & Run button glow | **Figma Make** (`ApproveButton.tsx`) | Directional bottom-edge glow as specified |
| Tool chip running state | **Figma Make** (`ToolChip.tsx`) | Scanline + progress bar implemented |
| Streaming text fade | **Figma Make** (`StreamingText.tsx`) | Per-word opacity gradient implemented |
| Modal entry/exit animation | **Figma Make** (`PermissionModal.tsx`) | Implemented with proper timing |
| Settings panel layout | **Claude Design** (`surfaces.jsx`) | Figma Make didn't ship this |
| Onboarding flow | **Claude Design** (`surfaces.jsx`) | Figma Make didn't ship this |
| Error surfaces (rollback, bridge lost) | **Claude Design** (`surfaces.jsx`) | Figma Make only shipped permission modal |
| Plan card structure | **Claude Design** | More complete |
| Accessibility rules (WCAG, focus rings) | **Claude Design** | Figma Make didn't document |

---

## Specific token overrides

The default `DESIGN_SYSTEM.md` tokens were computed in flat hex. Use these refined values from Figma Make instead — they were tuned with rationale documented in `reference/figma-make-runnable/DESIGN_NOTES.md`:

### Backgrounds — use HSL with cool tilt and decreasing saturation

```css
--color-bg-base: hsl(240, 6%, 4%);       /* was #0A0A0A */
--color-bg-surface: hsl(240, 5%, 8.5%);  /* was #141414 */
--color-bg-elevated: hsl(240, 4%, 12%);  /* was #1C1C1C */
--color-bg-raised: hsl(240, 3%, 15%);    /* was #242424 */
```

The cool blue tilt (hue 240) prevents muddy/warm blacks. Saturation decreases as lightness increases to keep neutrals neutral. Both intentional.

### Accent — refined sage-phosphor

```css
--color-accent-default: hsl(142, 65%, 58%);     /* not flat #4ADE80 */
--color-accent-hover:   hsl(142, 68%, 64%);
--color-accent-active:  hsl(142, 60%, 50%);
```

Hue 142 (warmer than pure 120 green), saturation 65% (not neon, not muted), lightness 58% (bright on dark, doesn't glow). Tuned, not picked.

### Shadows — multi-layer ambient + directional

```css
--shadow-sm:
  0 1px 2px hsla(0, 0%, 0%, 0.35);

--shadow-md:
  0 1px 2px  hsla(0, 0%, 0%, 0.40),
  0 4px 12px hsla(0, 0%, 0%, 0.45);

--shadow-lg:
  0 2px 4px  hsla(0, 0%, 0%, 0.45),
  0 12px 32px hsla(0, 0%, 0%, 0.55),
  0 0 0 1px  hsla(0, 0%, 100%, 0.04);

--shadow-xl:
  0 4px 8px  hsla(0, 0%, 0%, 0.50),
  0 16px 48px hsla(0, 0%, 0%, 0.60),
  0 0 0 1px  hsla(0, 0%, 100%, 0.05);

--shadow-glow-directional:
  0 2px 8px hsla(142, 65%, 58%, 0.25);
```

Single-layer shadows look flat on dark backgrounds. Two-layer (small ambient + larger directional) mimics real light. The 0.40-0.55 alphas are tuned for visibility on near-black — generic shadow values (0.15-0.25) disappear.

### Motion — perceptual-threshold timings

```css
--motion-fast:    100ms;   /* not 150ms */
--motion-default: 180ms;   /* not 200ms */
--motion-slow:    280ms;   /* not 300ms */
--motion-pulse:   2000ms;  /* breathing pace */

--ease-out:    cubic-bezier(0.16, 1, 0.3, 1);   /* not CSS default */
--ease-in-out: cubic-bezier(0.4, 0, 0.2, 1);
```

Specific timings come from perceptual research, not round numbers. CSS default `ease-out` decelerates too early — the custom curve has more middle-overshoot for a physical feel.

### Border opacity — barely-there

```css
--color-border-subtle:  hsla(0, 0%, 100%, 0.06);  /* not 0.10 */
--color-border-default: hsla(0, 0%, 100%, 0.09);  /* not 0.10 */
--color-border-strong:  hsla(0, 0%, 100%, 0.14);  /* not 0.16 */
```

Depth comes from shadows and tonal layering, not borders. Borders are edge hints, not dividers.

---

## Implementation rules (from Claude Design's README, preserved)

1. **No magic numbers.** Every color, size, spacing, radius, shadow, and duration in code must reference a CSS variable. If a value is needed that doesn't exist, add it to `DESIGN_SYSTEM.md` first, then `tokens.css`, then use it.
2. **No new accents.** One phosphor green. No second accent in V1.
3. **Dark only.** No light-mode speculation in V1.
4. **Fonts:** Inter + JetBrains Mono only. No fallback families used as intentional styles.
5. **Focus rings non-negotiable.** Every interactive element gets a 2px `--color-accent-ring` outline on `:focus-visible`.
6. **Respect `prefers-reduced-motion`.** Animations zero out. If an animation conveys state, find a non-motion way to convey the same state.
7. **Component states are exhaustive.** Per `DESIGN_SYSTEM.md` §7. Don't ship a button without a `:disabled` style.

---

## V1 scope boundaries

These are the demo-V1 limits. Don't build past them:

- Single dark theme (no light)
- Keybindings settings are read-only
- "Edit plan" button is present but disabled with a `v2` label
- No history/threads sidebar
- No secondary windows (logs, diff fullscreen)
- No multi-conversation
- Custom icons via the sprite (`icons/sprite.svg`) — don't import Lucide/Phosphor in V1

---

## Specific reference handoffs (for Day 12 visual polish)

When you implement the visual pass per SPEC.md Day 12, these are your concrete references:

### Bridge connection indicator (the signature element)

- Spec: `DESIGN_SYSTEM.md` (search "pulse dot")
- Implementation reference: `reference/figma-make-runnable/src/BridgeIndicator.tsx` + `BridgeIndicator.css`
- States: connected idle (2000ms pulse), connected active (1000ms pulse), disconnected (solid red, no pulse)
- The pulse expands from core dot to outer ring with opacity fade

### Approve & Run button (the most important button in the app)

- Implementation reference: `reference/figma-make-runnable/src/ApproveButton.tsx` + `ApproveButton.css`
- Directional **bottom-edge** glow, not all-around. Suggests light hitting the bottom of a raised surface.
- States: rest (subtle glow), hover (glow intensifies), pressed (scale 0.98), focus (+ accent ring)

### Tool chip running state

- Implementation reference: `reference/figma-make-runnable/src/ToolChip.tsx` + `ToolChip.css`
- Scanline: 6% white horizontal sweep over 1500ms linear
- Progress bar: 1px accent line, indeterminate, 1400ms ease-in-out

### Streaming text

- Implementation reference: `reference/figma-make-runnable/src/StreamingText.tsx` + `StreamingText.css`
- Recent words fade in over 80ms each
- Opacity gradient: oldest 100% → recent 80% → newest 60% (animating to 100%)
- Cursor blinks at 1000ms cycle, hard step (no fade)

### Modal entry/exit

- Implementation reference: `reference/figma-make-runnable/src/PermissionModal.tsx` + `PermissionModal.css`
- Backdrop: blur(2px) fades in over 200ms
- Modal: slides up 4px + fades in over 220ms ease-out, 30ms after backdrop
- Exit: reverse, 180ms

### Custom icons

- Sprite: `icons/sprite.svg` — 17 unique icons × 16px and 24px sizes, plus fill variants for status icons
- Logo: `myika-logo-16`, `myika-logo-32`, `myika-logo-32-fill` IDs in the sprite
- Use via `<svg><use href="path/to/sprite.svg#myika-16-read" /></svg>` or inline copy
- DO NOT install Lucide or Phosphor — V1 uses this custom set

---

## What NOT to do

1. **Do not copy the React structure** of either reference verbatim. Both are design deliverables, not production architecture. Re-implement using the existing patterns in the Tauri/React app.
2. **Do not pull either reference's `package.json` deps.** Work within what's already in the desktop app.
3. **Do not add features beyond V1 scope** even if the references show them. The references explored V1+; we ship demo first.
4. **Do not collapse multi-layer shadows to single layer.** Depth craft is in the layering.
5. **Do not round motion timings.** 180ms is different from 200ms. Use exactly what's specified.
6. **Do not relax border opacity** to make outlines more visible. Borders at 6-9% are correct; depth comes from shadow.
7. **Do not introduce additional accent colors.** One phosphor green. Period.

---

## When in doubt

- Spec questions → `DESIGN_SYSTEM.md`
- "Why does it look like this?" → `reference/figma-make-runnable/DESIGN_NOTES.md`
- "How is this implemented?" → `reference/figma-make-runnable/src/<component>.tsx + .css`
- "What does it look like?" → `Production.html`, `Animations.html`, `Icons.html`

If the spec and the reference disagree on a value, the spec wins UNLESS the spec value is in this README's overrides table — then the override wins.

---

## Bundle inventory

```
docs/design/handoff/
├── README.md                              # This file
├── DESIGN_SYSTEM.md                       # The spec (Claude Design)
├── tokens-claude-design.css               # Original spec tokens (reference only)
├── primitives.jsx                         # Atom components (reference only)
├── layout-e.jsx                           # Main window layout (reference only)
├── surfaces.jsx                           # Settings, modals, onboarding (reference only)
├── animations.css                         # Animation definitions (reference only)
├── Production.html                        # Visual canvas of all V1 screens
├── Animations.html                        # Animation specimens
├── Icons.html                             # Icon catalog
├── icons/
│   └── sprite.svg                         # Custom icon set + logo
└── reference/
    └── figma-make-runnable/               # Runnable React app (visual/motion reference)
        ├── DESIGN_NOTES.md                # Why each value was chosen (READ THIS)
        ├── README.md
        ├── package.json
        ├── index.html
        └── src/
            ├── tokens.css                 # Refined HSL tokens (use these values)
            ├── BridgeIndicator.tsx + .css # Signature element
            ├── ApproveButton.tsx + .css   # Directional glow CTA
            ├── ToolChip.tsx + .css        # Running state animation
            ├── StreamingText.tsx + .css   # Per-word fade
            ├── PermissionModal.tsx + .css # Modal entry timing
            ├── LayoutE.tsx + .css         # Main window
            ├── Icons.tsx                  # Inline SVG icons (older set)
            ├── App.tsx + .css + main.tsx  # Demo shell
```

---

## Sequencing note

This handoff is for **Day 12 (visual polish)** per SPEC.md. Do not start visual implementation until the bridge work, tool dispatcher, and core agentic flow are working (Days 1–11). When you reach Day 12, read this README, then implement the visual pass against the merged spec.

If you reach a Day 12 decision point not covered here, ask Jacob in chat — don't improvise.
