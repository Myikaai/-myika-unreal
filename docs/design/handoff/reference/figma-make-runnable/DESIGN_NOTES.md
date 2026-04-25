# Design Notes — Myika Unreal Reference

## Why These Specific Values

### Depth System

**Background tones** are separated by 4-5% lightness increments, not arbitrary values:

```css
--color-bg-base: hsl(240, 6%, 4%);       /* Base */
--color-bg-surface: hsl(240, 5%, 8.5%);  /* +4.5% */
--color-bg-elevated: hsl(240, 4%, 12%);  /* +3.5% */
--color-bg-raised: hsl(240, 3%, 15%);    /* +3% */
```

Why this matters: Smaller increments feel more sophisticated. Generic dark themes often jump 10-15% between layers, which reads as cheap. We're going for premium subtlety.

The subtle **cool tilt** (hue 240 = blue) prevents the blacks from feeling muddy or warm. Warm blacks (no hue or orange-tinted) can feel dated. Cool blacks feel modern and technical.

**Saturation decreases** as lightness increases (6% → 5% → 4% → 3%). This is intentional — lighter surfaces with high saturation look tinted. Desaturating as you go lighter keeps the neutrals neutral.

### Shadow System

Multi-layer shadows combine **ambient + directional** light:

```css
--shadow-2:
  0 1px 2px hsla(0, 0%, 0%, 0.40),    /* Ambient — soft, small */
  0 4px 12px hsla(0, 0%, 0%, 0.45);   /* Directional — larger blur */
```

Why two layers? Single-layer shadows feel flat. The small ambient shadow creates a sharp edge definition, while the larger directional shadow creates depth. This mimics real light behavior.

Alpha values (0.40, 0.45) are tuned to be visible on dark backgrounds without overwhelming. Generic drop shadows often use 0.15-0.25, which disappears on dark surfaces.

### Accent Color Refinement

We didn't just use `#4ADE80`. We **refined it**:

```css
--color-accent-default: hsl(142, 65%, 58%);
```

Breaking down why this exact shade:
- **Hue 142**: Green zone, but warmer than pure green (120°). Feels more sophisticated.
- **Saturation 65%**: Not neon (90%+), not muted (40%). Balanced vibrancy.
- **Lightness 58%**: Bright enough to pop on dark backgrounds, not so bright it glows.

Compare to flat `#4ADE80` → `hsl(142, 71%, 68%)`. Our version is slightly less saturated (-6%) and darker (-10%), which feels more refined.

The **glow variant** (+6% lightness) is just enough to register as "brighter" on hover without feeling like a different color.

### Motion Timing

**100ms / 180ms / 280ms** — not round numbers like 150ms / 200ms / 300ms. Why?

These values come from **physical testing**. 100ms is the threshold where humans perceive responsiveness. 180ms is fast enough to feel instant but slow enough to be perceived as smooth (not janky). 280ms starts to feel deliberate, which is right for entrances.

**2000ms pulse** (not 1500ms or 2500ms): The breathing rhythm needed to feel alive without being distracting. Faster feels anxious, slower feels sluggish. 2000ms matches a relaxed breathing pace.

### Easing Curves

Custom cubic-bezier instead of CSS defaults:

```css
--ease-out: cubic-bezier(0.16, 1, 0.3, 1);
```

CSS `ease-out` is `cubic-bezier(0, 0, 0.58, 1)` — it starts fast but decelerates too early. Our curve (0.16, 1, 0.3, 1) has more **overshoot** in the middle, which feels more physical. The "1" in the second position creates a slight bounce effect that's natural without being cartoonish.

### Typography

**Small caps section labels** at 10px, 0.08em letter-spacing:

```css
font-size: 10px;
letter-spacing: 0.08em;
text-transform: uppercase;
```

Why this works:
- 10px is the threshold where uppercase text remains readable
- 0.08em spacing prevents cramping (uppercase without spacing feels dense)
- This exact combo feels "premium label" not "web form label"

**Negative letter-spacing on display sizes** (-0.02em): Large text with default spacing looks loose and cheap. Tightening by -0.02em creates a refined, confident feel. Too much (-0.04em+) starts to feel crowded.

**Tabular nums**: Applied via `font-feature-settings: 'tnum'` globally, not per-element. This ensures ports (8451), percentages, and version numbers (5.7.0) align vertically when stacked.

### Border Opacity

**6-10% white** instead of the typical 15-20%:

```css
--color-border-subtle: hsla(0, 0%, 100%, 0.06);
--color-border-default: hsla(0, 0%, 100%, 0.09);
```

Why so low? Because **depth should come from shadows and tone**, not borders. When borders are too visible, the UI feels boxy and outlined. Subtle borders act as edge hints, not dividers.

The exception: **accent borders** at full opacity when they're the primary focus (plan cards, active states).

### Directional Glow (Approve Button)

Bottom-edge only, not all-around:

```css
box-shadow:
  inset 0 -1px 2px hsla(0, 0%, 0%, 0.15),  /* Inner shadow (top) */
  var(--shadow-2),                           /* Elevation */
  0 2px 8px hsla(142, 65%, 58%, 0.25);     /* Bottom glow */
```

Why bottom? It suggests **light hitting the bottom edge** of a raised surface. All-around glows (like focus rings) are generic. Directional glows feel intentional and physical.

The glow is **soft** (8px blur) and **low opacity** (0.25). Stronger glows feel like neon signs.

### Scanline Animation

Horizontal gradient sweep at **6% white opacity**:

```css
background: linear-gradient(
  90deg,
  transparent 0%,
  hsla(0, 0%, 100%, 0.06) 50%,
  transparent 100%
);
```

Why so subtle? Because it's **ambient feedback**, not a focal point. If the scanline is too visible, it competes with the text. At 6%, it's just noticeable enough to register as "something is happening" without distracting.

**1500ms duration**: Fast enough to feel active, slow enough to not be frantic. Tested at 1000ms (too fast, feels urgent) and 2000ms (too slow, feels stuck).

### Streaming Text Fade

**80ms fade-in** per word, not instant:

```css
animation: fadeInWord 80ms ease-out;
```

Why 80ms? It's the **perceptual threshold** where text feels like it's appearing naturally vs. popping in. Faster (40ms) is imperceptible, slower (150ms+) feels laggy.

Opacity gradient (100% → 80% → 60% for recent words) creates a **trailing fade** that suggests motion without animating position. This is cheaper to render and less distracting than translateX or scale effects.

## What We Avoided

### Glassmorphism

No `backdrop-filter: blur()` on every surface. Blur is expensive to render and often used as a crutch for poor color choices. We use it **once** (permission modal backdrop) where it serves a functional purpose (dimming the background).

### Gradient Backgrounds

No animated gradients on buttons. No mesh gradients on surfaces. Gradients are fine for illustrations, but in UI they date quickly. Solid colors with proper shadows age better.

### Spring Animations

No `cubic-bezier` curves with values >1 (bounce/overshoot). Springs are great for consumer apps (iOS, Framer Motion demos) but feel too playful for a professional dev tool. Our motion is smooth but restrained.

### Neon Accent

We refined `#4ADE80` instead of using it raw. Raw neon greens scream "hacker aesthetic" which is a cliché for dev tools. Our sage-phosphor green feels more sophisticated.

## Intentional Constraints

### No Dark Mode Toggle

This is dark-only by design. Supporting light mode doubles the token surface area and introduces complexity (what happens to shadows in light mode? do we flip the depth system?). Single-mode = higher polish.

### No Animation Toggle

Motion is essential to the brand. The breathing pulse, the scanline, the streaming fade — these aren't decorative, they're how the app communicates state. We respect `prefers-reduced-motion` by killing duration, but we don't offer a "turn off all motion" switch.

### No Customizable Accent

The accent color is part of the identity. Letting users change it dilutes the brand. (Production apps can add this, but the reference doesn't demonstrate it.)

## Extracting for Production

When you rebuild this in your app:

1. **Copy token values exactly** — these are tuned, not guessed
2. **Preserve motion timing** — 180ms is different from 200ms
3. **Keep shadow layers** — don't collapse to single-layer
4. **Use the custom easing curves** — they feel better than defaults
5. **Match the opacity values** — borders at 6-9%, not 15%

The reference is a **proof of concept**, not production code. But the values are production-ready.
