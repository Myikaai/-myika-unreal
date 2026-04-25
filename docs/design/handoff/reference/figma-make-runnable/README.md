# Myika Unreal — Reference Design

This is a reference implementation demonstrating the elevated visual and motion design for Myika Unreal. The focus is on extractable CSS values and motion patterns, not production architecture.

## Quick Start

```bash
pnpm install
pnpm dev
```

Open your browser to the URL shown (typically http://localhost:5173). Use the state switcher to view different UI states and observe the motion.

## What's Intentional

### 1. Bridge Connection Indicator

**The heartbeat of the app.** Not just a green dot.

- **Connected (idle)**: Slow breathing pulse (2000ms)
- **Connected (active)**: Faster pulse (1000ms) when tools are running
- **Disconnected**: Solid red, no pulse

The pulse expands from the core dot to an outer ring with opacity fade. This single element sets the motion language for the entire app.

**Extract from**: `src/BridgeIndicator.css` — keyframes and timing

### 2. Approve & Run Button

**The most important button in the app.** Directional glow on the BOTTOM edge only, not all around.

- At rest: Subtle glow suggests light hitting the bottom of a raised surface
- On hover: Glow intensifies
- On press: Physical feedback via scale (0.98)

**Why bottom glow?** More physical and intentional than a generic ring. Suggests real directional light.

**Extract from**: `src/ApproveButton.css` — shadow values and transitions

### 3. Running Tool Chip

Shows active processing without being distracting.

- **Scanline**: Horizontal sweep across chip (barely-visible, 6% white)
- **Progress bar**: 1px accent line along bottom edge
- Both animate continuously on 1500ms loop

**Extract from**: `src/ToolChip.css` — scanline gradient and progress animation

### 4. Streaming Text Fade

Words never appear instantly. Recent words fade in over ~80ms.

- Oldest words: 100% opacity (solid)
- Recent words: 80% opacity
- Newest word: 60% opacity (mid-fade)
- Cursor blinks naturally (1000ms cycle)

**Extract from**: `src/StreamingText.css` — fade timing and cursor animation

### 5. Permission Modal Entry

Professional motion. No bounce, no spring overshoot.

- **Entry**: 200ms ease-out with 4px y-translation
- **Backdrop**: Blur fades in simultaneously
- **Exit**: Reverse of entry

**Extract from**: `src/PermissionModal.css` — modal and backdrop keyframes

## Depth System

The layered surface system creates depth without heavy shadows:

```css
--color-bg-base: hsl(240, 6%, 4%);       /* Darkest — sidebar */
--color-bg-surface: hsl(240, 5%, 8.5%);  /* Chat column, +4% lighter */
--color-bg-elevated: hsl(240, 4%, 12%);  /* Cards, +8% lighter */
--color-bg-raised: hsl(240, 3%, 15%);    /* Buttons, +11% lighter */
```

Surfaces feel elevated via:
- Tone difference (not just borders)
- Multi-layer shadows (`--shadow-1` through `--shadow-4`)
- Subtle top highlights on surface layers
- Inner shadows on recessed elements (inputs, composer)

**Extract from**: `src/tokens.css` — background and shadow tokens

## Accent System

Not flat #4ADE80. A refined sage-phosphor system:

```css
--color-accent-default: hsl(142, 65%, 58%);  /* Primary */
--color-accent-glow: hsl(142, 68%, 64%);     /* Hover, lighter */
--color-accent-active: hsl(142, 60%, 50%);   /* Pressed, darker */
--color-accent-soft: hsla(142, 65%, 58%, 0.10); /* Backgrounds */
--color-accent-deep: hsl(142, 30%, 6%);      /* Deep backgrounds */
--color-accent-ring: hsla(142, 65%, 58%, 0.30); /* Focus rings */
```

**Extract from**: `src/tokens.css` — accent color palette

## Typography

Small caps section labels add instant polish:

```css
font-size: 10px;
font-weight: 500;
letter-spacing: 0.08em;
text-transform: uppercase;
color: var(--color-text-muted);
```

Display sizes get negative letter-spacing (-0.02em) for refinement.

Tabular nums (`'tnum'`) on all technical readouts (ports, latency, percentages).

**Extract from**: `src/LayoutE.css` — sidebar header styles

## Motion Philosophy

Timing:
- **Fast (100ms)**: Hovers, small state changes
- **Default (180ms)**: Most transitions, comfortable without lag
- **Slow (280ms)**: Entrances, dramatic changes
- **Pulse (2000ms)**: Breathing animations, ambient life

Easing:
- **ease-out**: Most exits and responses (snappy start, smooth end)
- **ease-in-out**: Bi-directional motion (modals, scales)

Custom curves are more natural than CSS defaults:

```css
--ease-out: cubic-bezier(0.16, 1, 0.3, 1);
--ease-in-out: cubic-bezier(0.4, 0, 0.2, 1);
```

**Extract from**: `src/tokens.css` — motion tokens

## Custom Icons

Six 16×16 icons with 2px stroke, slightly rounded caps:
- Read (eye)
- Write (pen)
- Execute (lightning)
- Search (magnifying glass)
- Asset (box)
- Code (brackets)

Stark and minimal, Phosphor/Lucide quality but custom.

**Extract from**: `src/Icons.tsx` — SVG components

## Files to Extract From

**Tokens**: `src/tokens.css`
- Color system (backgrounds, text, accent, status)
- Spacing scale (4px base)
- Radius values
- Shadow layers
- Motion timing and easing

**Components**:
- `src/BridgeIndicator.css` — Breathing pulse animation
- `src/ApproveButton.css` — Directional glow button
- `src/ToolChip.css` — Scanline + progress animations
- `src/StreamingText.css` — Word fade-in timing
- `src/PermissionModal.css` — Modal entrance/exit
- `src/LayoutE.css` — Depth system implementation

**Icons**: `src/Icons.tsx` — Custom SVG set

## What This Is NOT

- Not production code to merge into your project
- Not a complete implementation of all screens
- Not optimized for performance or accessibility
- Not a component library

This is **visual reference material**. Extract the values, patterns, and motion timing. Rebuild with your own architecture.

## Reference Taste

The design references:
- Linear — typographic restraint, density
- Raycast — command center feel, polished modals
- Warp — premium dev tool aesthetic
- Arc — elegant motion, micro-interactions
- Cursor — chat-as-primary-surface
- Things 3 — what "premium" actually means in dark UI

Avoiding:
- Generic AI startup gradients
- Glassmorphism everywhere
- Excessive bloom/glow
- Neon green Matrix vibes
- Animated gradient buttons
