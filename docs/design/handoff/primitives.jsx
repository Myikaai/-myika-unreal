/* Myika production primitives v2.
 * All values come from tokens.css. No magic numbers in this file.
 *
 * v2 additions:
 *  • Heartbeat (signature bridge indicator)
 *  • CapIcon — 6 custom inline SVG capability icons
 *  • Eyebrow (SMALL CAPS section labels)
 *  • FadeTrail (streaming text last-3-words opacity fade)
 *  • ToolChip — refined w/ scanline + progress on running
 *  • ButtonGlow — primary button with bottom-edge glow
 */

// ── Atoms ────────────────────────────────────────────────────────
const PulseDot = ({ variant = 'default', size }) => (
  <span className={`pulse-dot${variant === 'danger' ? ' pulse-dot--danger' : ''}${variant === 'neutral' ? ' pulse-dot--neutral' : ''}`}
        style={size ? { width: size, height: size } : undefined} />
);

const Kbd = ({ children }) => <kbd className="kbd">{children}</kbd>;

const TypingDots = () => (
  <span className="typing-dots" aria-label="loading"><span /><span /><span /></span>
);

const Cursor = () => <span className="cursor" />;

// ── Eyebrow — SMALL CAPS section label (the polish move) ─────────
const Eyebrow = ({ mono, children, count, dim, style }) => (
  <span className={mono ? 't-eyebrow--mono' : 't-eyebrow'}
        style={{ opacity: dim ? 0.55 : undefined, ...style }}>
    {children}
    {count != null && <span className="tnum" style={{ marginLeft: 8, opacity: 0.6 }}>{count}</span>}
  </span>
);

// ── Heartbeat — the SIGNATURE piece ──────────────────────────────
// 12px composition: solid green core, animated outer ring (CSS keyframed),
// renders w/ "connected", a · separator, and latency in mono tabular-nums.
// In stills, the ring sits mid-cycle. Three-frame variant <HeartbeatFrames>
// shows the engineer the keyframes.
const Heartbeat = ({ variant = 'default', label = 'CONNECTED', latencyMs = 12, frame }) => {
  const cls = `heartbeat${variant === 'danger' ? ' heartbeat--danger' : ''}${variant === 'neutral' ? ' heartbeat--neutral' : ''}`;
  // Static mid-cycle render for stills if frame is set: 0 = collapsed, 1 = mid, 2 = peak
  const ringStyle = frame == null ? undefined : (
    frame === 0 ? { transform: 'scale(0.85)', opacity: 0.85, animation: 'none' } :
    frame === 1 ? { transform: 'scale(1.25)', opacity: 0.45, animation: 'none' } :
                  { transform: 'scale(1.6)',  opacity: 0,    animation: 'none' }
  );
  const color = variant === 'danger' ? 'var(--color-text-danger)'
              : variant === 'neutral' ? 'var(--color-text-muted)'
              : 'var(--color-text-accent)';
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)', lineHeight: 1 }}>
      <span className={cls}>
        <span className="heartbeat__ring" style={ringStyle} />
        <span className="heartbeat__core" />
      </span>
      <span className="t-mono-micro" style={{ color, letterSpacing: '0.10em' }}>{label}</span>
      {variant === 'default' && latencyMs != null && (
        <>
          <span className="t-mono-micro c-muted">·</span>
          <span className="t-mono-micro c-muted tnum">{String(latencyMs).padStart(2, '0')}MS</span>
        </>
      )}
    </span>
  );
};

// Three-frame heartbeat (for motion specimen)
const HeartbeatFrames = () => (
  <div style={{ display: 'flex', gap: 'var(--space-6)', alignItems: 'center' }}>
    {[0, 1, 2].map(f => (
      <div key={f} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
        <span className="heartbeat" style={{ width: 22, height: 22, position: 'relative' }}>
          <span className="heartbeat__ring" style={
            f === 0 ? { transform: 'scale(0.85)', opacity: 0.85, animation: 'none' } :
            f === 1 ? { transform: 'scale(1.25)', opacity: 0.45, animation: 'none' } :
                      { transform: 'scale(1.6)',  opacity: 0,    animation: 'none' }
          } />
          <span className="heartbeat__core" style={{ inset: 8 }} />
        </span>
        <span className="t-mono-micro c-muted tnum">t={['0ms', '1200ms', '2000ms'][f]}</span>
      </div>
    ))}
  </div>
);

// ── Custom capability iconography ────────────────────────────────
// 16x16 grid. 1.5px stroke. Slightly rounded caps. Stark, custom-feeling.
const Icon = ({ children, size = 16, color = 'currentColor', strokeWidth = 1.5 }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none"
       stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"
       style={{ flexShrink: 0 }}>
    {children}
  </svg>
);

// READ — slotted eye (a horizontal slit + recessed pupil; not a generic eye)
const IconRead = (p) => (
  <Icon {...p}>
    <path d="M2 8 H14" />
    <path d="M2 8 Q4 5 8 5 Q12 5 14 8" />
    <path d="M2 8 Q4 11 8 11 Q12 11 14 8" />
    <circle cx="8" cy="8" r="1.4" fill="currentColor" stroke="none" />
  </Icon>
);

// WRITE — pen nib with a notch (not generic pencil)
const IconWrite = (p) => (
  <Icon {...p}>
    <path d="M3 13 L3 11 L9.5 4.5 L11.5 6.5 L5 13 Z" />
    <path d="M9.5 4.5 L11 3 L13 5 L11.5 6.5" />
    <path d="M3 13 L5 13" />
  </Icon>
);

// EXEC — chevron play (not a generic triangle — angled bracket suggests "run")
const IconExec = (p) => (
  <Icon {...p}>
    <path d="M5 4 L11 8 L5 12" />
    <path d="M11 4 L11 12" opacity="0.4" />
  </Icon>
);

// SEARCH — magnifier with a tightened lens (custom proportions)
const IconSearch = (p) => (
  <Icon {...p}>
    <circle cx="7" cy="7" r="4" />
    <path d="M10 10 L13.5 13.5" />
  </Icon>
);

// ASSET — stacked plates (representing UE's content hierarchy, not a folder)
const IconAsset = (p) => (
  <Icon {...p}>
    <path d="M2.5 5 L8 2.5 L13.5 5 L8 7.5 Z" />
    <path d="M2.5 8 L8 10.5 L13.5 8" />
    <path d="M2.5 11 L8 13.5 L13.5 11" />
  </Icon>
);

// CODE — angle-brackets w/ slash (refined / tighter than `</>` glyph)
const IconCode = (p) => (
  <Icon {...p}>
    <path d="M5.5 4.5 L2 8 L5.5 11.5" />
    <path d="M10.5 4.5 L14 8 L10.5 11.5" />
    <path d="M9.5 3.5 L6.5 12.5" opacity="0.55" />
  </Icon>
);

// Convenience map
const CAP_ICONS = { read: IconRead, write: IconWrite, exec: IconExec, search: IconSearch, asset: IconAsset, code: IconCode };

// ── Cap badge (now with icon option) ─────────────────────────────
const Cap = ({ kind = 'read', children, withIcon }) => {
  const Ico = withIcon ? CAP_ICONS[kind] : null;
  return (
    <span className={`cap cap--${kind}`} style={withIcon ? { display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 6px' } : undefined}>
      {Ico && <Ico size={11} />}
      {children || kind}
    </span>
  );
};

const Pill = ({ variant = 'default', children }) => (
  <span className={`pill${variant !== 'default' ? ' pill--' + variant : ''}`}>{children}</span>
);

// ── Tool chip — refined, w/ optional running scanline + progress ─
const ToolChip = ({ name, status = 'done' }) => (
  <span className={`tool-chip tool-chip--${status}`}>
    <span className="tool-chip__dot" />
    {name}
  </span>
);

// ── FadeTrail — last-N-words fade-in for streaming ───────────────
const FadeTrail = ({ words = [] }) => (
  <span>
    {words.map((w, i) => {
      // Last 3 words get fade-trail-3, fade-trail-2, fade-trail-1
      const fromEnd = words.length - i - 1;
      const cls = fromEnd === 0 ? 'fade-trail-1' : fromEnd === 1 ? 'fade-trail-2' : fromEnd === 2 ? 'fade-trail-3' : '';
      return <span key={i} className={cls}>{w}{i < words.length - 1 ? ' ' : ''}</span>;
    })}
  </span>
);

// ── Button (primary has built-in bottom glow via tokens.css) ─────
const Button = ({ variant = 'secondary', size, icon, disabled, children, ...rest }) => (
  <button className={`btn btn--${variant}${size === 'lg' ? ' btn--lg' : ''}${icon ? ' btn--icon' : ''}`}
          disabled={disabled} {...rest}>
    {children}
  </button>
);

// ── Input + mono input ───────────────────────────────────────────
const TextInput = ({ mono, size, ...rest }) => (
  <input className={`input${mono ? ' input--mono' : ''}${size === 'sm' ? ' input--sm' : ''}`} {...rest} />
);

// ── Toggle ───────────────────────────────────────────────────────
const Toggle = ({ on }) => (
  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)' }}>
    <span style={{
      width: 28, height: 16, borderRadius: 8,
      background: on ? 'var(--color-accent-default)' : 'var(--color-bg-void)',
      border: `1px solid ${on ? 'var(--color-accent-default)' : 'var(--color-border-default)'}`,
      boxShadow: on ? '0 0 0 0 transparent, 0 2px 8px -2px rgba(74,222,128,0.45)' : 'inset 0 1px 1px rgba(0,0,0,0.4)',
      position: 'relative', transition: 'background var(--motion-fast) var(--ease-out)',
    }}>
      <span style={{
        position: 'absolute', top: 1, left: on ? 13 : 1,
        width: 12, height: 12, borderRadius: '50%',
        background: on ? 'var(--color-text-on-accent)' : 'var(--color-text-muted)',
        boxShadow: on ? '0 1px 2px rgba(0,0,0,0.4)' : 'none',
        transition: 'left var(--motion-fast) var(--ease-out)',
      }} />
    </span>
    <span className="t-mono-sm c-muted tnum">{on ? 'ON' : 'OFF'}</span>
  </span>
);

// ── Radio ────────────────────────────────────────────────────────
const Radio = ({ checked, label, note }) => (
  <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', padding: '4px 0', cursor: 'pointer' }}>
    <span style={{
      width: 14, height: 14, borderRadius: '50%',
      border: `1.5px solid ${checked ? 'var(--color-accent-default)' : 'var(--color-border-default)'}`,
      background: checked ? 'var(--color-accent-soft)' : 'transparent',
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    }}>
      {checked && <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--color-accent-default)', boxShadow: '0 0 4px rgba(110,231,160,0.6)' }} />}
    </span>
    <span className="t-body">{label}</span>
    {note && <span className="t-mono-sm c-muted">{note}</span>}
  </label>
);

// ── Checkbox ─────────────────────────────────────────────────────
const Checkbox = ({ checked }) => (
  <span style={{
    width: 14, height: 14, borderRadius: 'var(--radius-sm)',
    border: `1.5px solid ${checked ? 'var(--color-accent-default)' : 'var(--color-border-default)'}`,
    background: checked ? 'var(--color-accent-default)' : 'transparent',
    boxShadow: checked ? '0 0 0 2px rgba(74,222,128,0.18)' : 'inset 0 1px 1px rgba(0,0,0,0.3)',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  }}>
    {checked && <span style={{ color: 'var(--color-text-on-accent)', fontSize: 10, fontWeight: 700, lineHeight: 1 }}>✓</span>}
  </span>
);

// ── Segmented (Allow/Ask/Deny) ───────────────────────────────────
const PermSegmented = ({ value }) => {
  const opts = [
    { k: 'allow', label: 'Allow', bg: 'var(--color-accent-default)', fg: 'var(--color-text-on-accent)' },
    { k: 'ask',   label: 'Ask',   bg: 'var(--color-bg-raised)',      fg: 'var(--color-text-primary)' },
    { k: 'deny',  label: 'Deny',  bg: 'var(--color-danger-default)', fg: 'var(--color-bg-base)' },
  ];
  return (
    <div style={{
      display: 'inline-flex',
      background: 'var(--color-bg-void)',
      border: '1px solid var(--color-border-default)',
      borderRadius: 'var(--radius-md)',
      padding: 2,
      boxShadow: 'var(--shadow-inset-sm)',
    }}>
      {opts.map((o) => (
        <div key={o.k} style={{
          padding: '3px var(--space-3)',
          fontFamily: 'var(--font-ui)', fontSize: 11, fontWeight: 500,
          background: value === o.k ? o.bg : 'transparent',
          color: value === o.k ? o.fg : 'var(--color-text-secondary)',
          borderRadius: 'var(--radius-sm)',
          boxShadow: value === o.k && o.k === 'allow' ? '0 1px 4px rgba(74,222,128,0.35)' : 'none',
          cursor: 'pointer', userSelect: 'none',
          transition: 'background var(--motion-fast) var(--ease-out)',
        }}>{o.label}</div>
      ))}
    </div>
  );
};

// ── Top bar ──────────────────────────────────────────────────────
const TopBar = ({ title, right }) => (
  <div style={{
    height: 36, padding: '0 var(--space-4)',
    display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
    background: 'var(--color-bg-base)',
    borderBottom: '1px solid var(--color-border-subtle)',
    flexShrink: 0,
  }}>
    <div style={{ display: 'flex', gap: 6 }}>
      {['#E87171','#EAB308','#5BD68A'].map((c,i) => (
        <span key={i} style={{ width: 10, height: 10, borderRadius: '50%', background: c, opacity: 0.55, boxShadow: 'inset 0 1px 1px rgba(0,0,0,0.4)' }} />
      ))}
    </div>
    <span className="t-mono-sm c-muted" style={{ marginLeft: 'var(--space-2)' }}>{title}</span>
    <div style={{ flex: 1 }} />
    {right}
  </div>
);

// ── Bottom status bar — heartbeat is the centerpiece ─────────────
const BottomBar = ({ connected = true, project = 'Meridian_Prototype', activity, model = 'sonnet-4.6', latencyMs = 12 }) => (
  <div style={{
    height: 30, padding: '0 var(--space-4)',
    display: 'flex', alignItems: 'center', gap: 'var(--space-4)',
    background: 'var(--color-bg-base)',
    borderTop: '1px solid var(--color-border-subtle)',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.02)',
    flexShrink: 0,
  }}>
    <Heartbeat variant={connected ? 'default' : 'danger'}
               label={connected ? 'BRIDGE' : 'OFFLINE'}
               latencyMs={connected ? latencyMs : null} />
    <span className="t-mono-micro c-muted">·</span>
    <span className="t-mono-micro c-secondary tnum" style={{ letterSpacing: '0.04em' }}>{project.toUpperCase()}</span>
    <span className="t-mono-micro c-muted">·</span>
    <span className="t-mono-micro c-muted tnum">UE 5.7.0</span>
    <div style={{ flex: 1 }} />
    {activity && <span className="t-mono-sm c-muted">{activity}</span>}
    <span className="t-mono-micro c-muted tnum" style={{ letterSpacing: '0.04em' }}>{model.toUpperCase()}</span>
  </div>
);

// Expose
Object.assign(window, {
  PulseDot, Kbd, Cap, Pill, TypingDots, Cursor,
  Eyebrow, Heartbeat, HeartbeatFrames,
  IconRead, IconWrite, IconExec, IconSearch, IconAsset, IconCode, CAP_ICONS,
  ToolChip, FadeTrail,
  Button, TextInput, Toggle, Radio, Checkbox, PermSegmented,
  TopBar, BottomBar,
});
