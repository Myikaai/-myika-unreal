/* Settings + Modals + Onboarding + Errors — production v2.
 *
 * v2 treatment: depth, layered surfaces, SMALL CAPS labels,
 * inset inputs, multi-layer modal shadows, heartbeat in connection
 * states, custom capability icons in tool permission rows.
 */

const SET_W = 960, SET_H = 720;

// ── Settings shell ───────────────────────────────────────────────
function Settings({ section = 'model' }) {
  const nav = [
    ['general',  'General'],
    ['model',    'Model & API'],
    ['bridge',   'Unreal bridge'],
    ['perms',    'Tool permissions'],
    ['theme',    'Theme'],
    ['keys',     'Keybindings'],
    ['about',    'About'],
  ];
  return (
    <div style={{ width: SET_W, height: SET_H, background: 'var(--color-bg-base)', display: 'flex', flexDirection: 'column' }}>
      <TopBar title="myika · settings" />
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        <div style={{ flex: '0 0 208px', borderRight: '1px solid var(--color-border-subtle)', padding: 'var(--space-5) 0 var(--space-5) var(--space-2)', background: 'var(--color-bg-base)' }}>
          <div style={{ padding: '0 var(--space-4) var(--space-3)' }}>
            <Eyebrow>Settings</Eyebrow>
          </div>
          {nav.map(([k, label]) => {
            const active = k === section;
            return (
              <div key={k} style={{
                margin: '1px var(--space-2)',
                padding: '7px var(--space-3)',
                background: active ? 'var(--color-bg-elevated)' : 'transparent',
                borderRadius: 'var(--radius-md)',
                color: active ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                fontFamily: 'var(--font-ui)', fontSize: 13,
                fontWeight: active ? 500 : 400, cursor: 'pointer',
                position: 'relative',
                boxShadow: active ? 'var(--highlight-top), var(--shadow-sm)' : 'none',
              }}>
                {active && <span style={{ position: 'absolute', left: -2, top: 8, bottom: 8, width: 2, background: 'var(--color-accent-default)', borderRadius: 1, boxShadow: '0 0 6px rgba(74,222,128,0.6)' }} />}
                {label}
              </div>
            );
          })}
        </div>
        <div style={{ flex: 1, padding: 'var(--space-8) var(--space-10)', background: 'var(--color-bg-surface)', overflow: 'auto', boxShadow: 'inset 1px 0 0 rgba(255,255,255,0.02)' }}>
          {section === 'model' && <SecModel />}
          {section === 'bridge' && <SecBridge />}
          {section === 'perms' && <SecPerms />}
          {section === 'keys' && <SecKeys />}
          {section === 'theme' && <SecTheme />}
        </div>
      </div>
    </div>
  );
}

const SecHead = ({ title, sub, eyebrow }) => (
  <div style={{ marginBottom: 'var(--space-6)' }}>
    {eyebrow && <Eyebrow style={{ display: 'block', marginBottom: 8 }}>{eyebrow}</Eyebrow>}
    <div className="t-display c-primary" style={{ fontSize: 22 }}>{title}</div>
    {sub && <div className="t-body-sm c-muted" style={{ marginTop: 6 }}>{sub}</div>}
  </div>
);

const Row = ({ label, hint, children }) => (
  <div style={{
    padding: 'var(--space-4) 0',
    borderBottom: '1px solid var(--color-border-subtle)',
    display: 'grid', gridTemplateColumns: '220px 1fr', gap: 'var(--space-6)',
  }}>
    <div>
      <div className="t-label c-primary">{label}</div>
      {hint && <div className="t-caption c-muted" style={{ marginTop: 4, lineHeight: 1.5 }}>{hint}</div>}
    </div>
    <div>{children}</div>
  </div>
);

const InputWithBtn = ({ type = 'text', value, button, width = 320 }) => (
  <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
    <div style={{ width }}>
      <TextInput mono={type === 'password'} defaultValue={type === 'password' ? '•'.repeat(28) : value} />
    </div>
    {button && <Button variant="secondary">{button}</Button>}
  </div>
);

function SecModel() {
  return (
    <>
      <SecHead eyebrow="Settings · 2 of 7" title="Model & API" sub="Which model Myika uses, and how it authenticates." />
      <Row label="Primary model" hint="Used for reasoning and tool orchestration.">
        <Radio checked label="Sonnet 4.6" note="balanced · default" />
        <Radio label="Opus 4.7" note="slower, deeper plans" />
        <Radio label="Haiku 4.5" note="fast, narrow tasks" />
      </Row>
      <Row label="Anthropic API key" hint="Stored in OS keychain. Never leaves this machine.">
        <InputWithBtn type="password" button="Test connection" />
        <div style={{ marginTop: 'var(--space-3)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <span className="t-mono-sm c-accent">✓ valid</span>
          <span className="t-mono-sm c-muted">· last tested 12 min ago</span>
        </div>
      </Row>
      <Row label="Max context" hint="Upper bound on tokens kept in conversation.">
        <div style={{ width: 180 }}><TextInput mono defaultValue="200,000 tokens" /></div>
      </Row>
      <Row label="Telemetry" hint="Anonymous usage metrics only. No code or prompts.">
        <Toggle on />
      </Row>
    </>
  );
}

function SecBridge() {
  return (
    <>
      <SecHead eyebrow="Settings · 3 of 7" title="Unreal bridge" sub="How Myika talks to your UE editor plugin." />
      <Row label="Port" hint="The plugin listens on this port. Must match plugin config.">
        <div style={{ width: 120 }}><TextInput mono defaultValue="8451" /></div>
      </Row>
      <Row label="Auto-reconnect" hint="Re-establish the bridge automatically if it drops.">
        <Toggle on />
      </Row>
      <Row label="Heartbeat interval" hint="How often Myika pings the plugin.">
        <div style={{ width: 100 }}><TextInput mono defaultValue="2s" /></div>
      </Row>
      <Row label="Status">
        <div style={{
          padding: 'var(--space-3) var(--space-4)',
          background: 'var(--color-bg-elevated)',
          border: '1px solid var(--color-border-subtle)',
          borderRadius: 'var(--radius-md)',
          boxShadow: 'var(--highlight-top), var(--shadow-sm)',
          display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
        }}>
          <Heartbeat label="CONNECTED" latencyMs={11} />
          <span className="t-mono-sm c-muted">·</span>
          <span className="t-mono-sm c-secondary tnum">MERIDIAN_PROTOTYPE</span>
          <div style={{ flex: 1 }} />
          <Button variant="secondary">Reconnect</Button>
        </div>
      </Row>
    </>
  );
}

function SecPerms() {
  const cats = [
    { title: 'Read', kind: 'read', desc: 'No project state is changed.', tools: [
      ['list_assets', 'allow', 'read'], ['read_blueprint', 'allow', 'read'],
      ['read_file', 'allow', 'read'], ['query_actors', 'allow', 'read'],
      ['search_assets', 'allow', 'search'],
    ]},
    { title: 'Write', kind: 'write', desc: 'Mutates project files / assets.', tools: [
      ['duplicate_asset', 'ask', 'write'], ['reparent_bp', 'ask', 'write'],
      ['save_asset', 'ask', 'write'], ['spawn_actor', 'ask', 'write'],
      ['delete_asset', 'deny', 'write'],
    ]},
    { title: 'Execute', kind: 'exec', desc: 'Runs code or long-running jobs.', tools: [
      ['run_python', 'ask', 'exec'], ['bake_lighting', 'ask', 'exec'], ['run_shell', 'deny', 'exec'],
    ]},
  ];
  return (
    <>
      <SecHead eyebrow="Settings · 4 of 7" title="Tool permissions" sub="For each tool: Allow (silent), Ask (prompt each time), Deny (blocked)." />
      {cats.map(c => (
        <div key={c.title} style={{ marginBottom: 'var(--space-6)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-2)' }}>
            <Eyebrow>{c.title}</Eyebrow>
            <span className="t-caption c-muted">— {c.desc}</span>
            <div style={{ flex: 1 }} />
            <span className="t-mono-sm c-muted" style={{ cursor: 'pointer' }}>set all ▾</span>
          </div>
          <div style={{
            background: 'var(--color-bg-elevated)',
            border: '1px solid var(--color-border-subtle)',
            borderRadius: 'var(--radius-md)',
            boxShadow: 'var(--highlight-top), var(--shadow-sm)',
            overflow: 'hidden',
          }}>
            {c.tools.map(([n, m, ic], i) => {
              const Ico = CAP_ICONS[ic];
              const tone = c.kind === 'write' ? 'var(--color-text-warning)'
                         : c.kind === 'exec'  ? 'var(--color-text-danger)'
                         : 'var(--color-text-secondary)';
              return (
                <div key={n} style={{
                  padding: 'var(--space-3) var(--space-4)',
                  display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
                  borderTop: i ? '1px solid var(--color-border-subtle)' : 'none',
                }}>
                  <span style={{ width: 14, color: tone, display: 'inline-flex' }}><Ico size={14} color={tone} /></span>
                  <span className="t-mono c-primary" style={{ flex: 1 }}>{n}</span>
                  <PermSegmented value={m} />
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </>
  );
}

function SecKeys() {
  const rows = [
    ['Send message', ['↵']],
    ['New line in input', ['⇧', '↵']],
    ['Command palette', ['⌘', 'K']],
    ['Approve plan', ['⌘', '↵']],
    ['Always-allow current tool', ['⌘', '⇧', '↵']],
    ['Deny current tool', ['esc']],
    ['Expand last tool call', ['⌘', 'E']],
    ['Toggle right panel', ['⌘', 'J']],
    ['Focus composer', ['⌘', 'L']],
    ['Settings', ['⌘', ',']],
  ];
  return (
    <>
      <SecHead eyebrow="Settings · 6 of 7" title="Keybindings" sub="Read-only in V1. Remapping lands in V2." />
      <div style={{
        background: 'var(--color-bg-elevated)',
        border: '1px solid var(--color-border-subtle)',
        borderRadius: 'var(--radius-md)',
        boxShadow: 'var(--highlight-top), var(--shadow-sm)',
        overflow: 'hidden',
      }}>
        {rows.map(([l, ks], i) => (
          <div key={i} style={{
            padding: 'var(--space-3) var(--space-4)',
            display: 'flex', alignItems: 'center',
            borderTop: i ? '1px solid var(--color-border-subtle)' : 'none',
          }}>
            <span className="t-body c-primary" style={{ flex: 1 }}>{l}</span>
            <span style={{ display: 'inline-flex', gap: 3 }}>{ks.map((k, j) => <Kbd key={j}>{k}</Kbd>)}</span>
          </div>
        ))}
      </div>
    </>
  );
}

function SecTheme() {
  return (
    <>
      <SecHead eyebrow="Settings · 5 of 7" title="Theme" sub="Dark-only in V1. Accent color is adjustable." />
      <Row label="Appearance">
        <Radio checked label="Dark" note="default" />
        <Radio label="Light" note="v2" />
        <Radio label="Match system" note="v2" />
      </Row>
      <Row label="Accent">
        <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
          {['#4ADE80', '#7AA9D6', '#C58FF0', '#EAB308'].map((c, i) => (
            <span key={i} style={{
              width: 28, height: 28, background: c, borderRadius: '50%',
              border: `2px solid ${i === 0 ? 'var(--color-text-primary)' : 'transparent'}`,
              boxShadow: i === 0 ? `0 0 0 2px ${c}30, 0 2px 8px ${c}55` : 'inset 0 1px 1px rgba(0,0,0,0.3)',
              cursor: 'pointer',
            }} />
          ))}
        </div>
      </Row>
      <Row label="Font size">
        <Radio label="Compact" />
        <Radio checked label="Default" />
        <Radio label="Large" />
      </Row>
    </>
  );
}

// ── Permission Modal ─────────────────────────────────────────────
function PermissionModal() {
  return (
    <div role="dialog" aria-modal="true" className="surface--modal" style={{ width: 480 }}>
      <div style={{ padding: 'var(--space-5) var(--space-5) var(--space-3)' }}>
        <Eyebrow style={{ color: 'var(--color-text-warning)', opacity: 1 }}>Permission · trust moment</Eyebrow>
        <div className="t-h1 c-primary" style={{ marginTop: 'var(--space-2)' }}>Myika wants to run a tool</div>
      </div>

      <div style={{ padding: '0 var(--space-5) var(--space-4)' }}>
        <div style={{
          padding: 'var(--space-3) var(--space-4)',
          background: 'var(--color-bg-raised)',
          border: '1px solid var(--color-border-subtle)',
          borderRadius: 'var(--radius-md)',
          boxShadow: 'var(--highlight-top)',
          display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
        }}>
          <IconExec size={16} color="var(--color-text-danger)" />
          <span className="t-mono c-primary" style={{ flex: 1 }}>run_python</span>
          <Cap kind="exec" withIcon>exec</Cap>
        </div>

        <Eyebrow style={{ display: 'block', marginTop: 'var(--space-4)', marginBottom: 'var(--space-2)' }}>Arguments</Eyebrow>
        <pre className="t-mono-lg c-primary surface--inset" style={{
          margin: 0, padding: 'var(--space-3) var(--space-4)',
          borderRadius: 'var(--radius-md)',
        }}>{`script:   timeline_scaffold.py
target:   BP_InteractableDoor
duration: 1.0s`}</pre>

        <div style={{
          marginTop: 'var(--space-4)',
          padding: 'var(--space-3) var(--space-4)',
          background: 'var(--color-bg-warning-soft)',
          border: '1px solid rgba(234,179,8,0.20)',
          borderRadius: 'var(--radius-md)',
        }}>
          <span className="t-body-sm c-secondary">
            Will generate a <span className="mono t-mono c-primary">.uasset</span> Timeline and attach it to{' '}
            <span className="mono t-mono c-primary">BP_InteractableDoor</span>. Reversible via git checkpoint.
          </span>
        </div>
      </div>

      <div style={{
        padding: 'var(--space-3) var(--space-5)',
        borderTop: '1px solid var(--color-border-subtle)',
        display: 'flex', gap: 'var(--space-2)',
      }}>
        <Button variant="primary" size="lg" style={{ flex: 1 }}>Allow once</Button>
        <Button variant="secondary" size="lg">Always allow</Button>
        <Button variant="destructive" size="lg">Deny</Button>
      </div>
      <div style={{
        padding: '8px var(--space-5)', borderTop: '1px solid var(--color-border-subtle)',
        background: 'var(--color-bg-base)',
        borderBottomLeftRadius: 'var(--radius-xl)', borderBottomRightRadius: 'var(--radius-xl)',
      }}>
        <span className="t-mono-sm c-muted" style={{ display: 'inline-flex', gap: 'var(--space-3)' }}>
          <span><Kbd>⌘</Kbd><Kbd>↵</Kbd> allow</span>
          <span><Kbd>⌘</Kbd><Kbd>⇧</Kbd><Kbd>↵</Kbd> always</span>
          <span><Kbd>esc</Kbd> deny</span>
        </span>
      </div>
    </div>
  );
}

// ── Plan expanded ────────────────────────────────────────────────
function PlanExpanded({ dryRun = false }) {
  const steps = [
    { t: 'Duplicate SM_Door_Oak → BP_InteractableDoor', tool: 'duplicate_asset', cap: 'write', checked: true },
    { t: 'Reparent to InteractableActor', tool: 'reparent_bp', cap: 'write', checked: true },
    { t: 'Add Timeline "DoorOpen" (1.0s)', tool: 'run_python', cap: 'exec', checked: true, needsAsk: true, expanded: true },
    { t: 'Add BoxComponent Trigger (220×90×10)', tool: 'spawn_actor', cap: 'write', checked: true },
    { t: 'Register with Interaction subsystem', tool: 'save_asset', cap: 'write', checked: false },
  ];
  return (
    <div style={{
      width: 580,
      background: 'var(--color-bg-accent-deep)',
      border: '1px solid var(--color-border-accent)',
      borderRadius: 'var(--radius-lg)',
      boxShadow: 'var(--highlight-top), var(--shadow-lg)',
      overflow: 'hidden',
    }}>
      <div style={{
        padding: 'var(--space-4)',
        background: 'linear-gradient(180deg, rgba(74,222,128,0.10), rgba(74,222,128,0.02))',
        borderBottom: '1px solid rgba(74,222,128,0.12)',
        display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
      }}>
        <Eyebrow style={{ color: 'var(--color-text-accent)', opacity: 1 }}>
          {dryRun ? 'Dry-run preview · 5 steps' : 'Plan · 5 steps'}
        </Eyebrow>
        <div style={{ flex: 1 }} />
        <span className="t-mono-sm c-muted tnum">~40s est.</span>
      </div>

      <div style={{ padding: 'var(--space-2) var(--space-4) var(--space-3)' }}>
        {steps.map((s, i) => {
          const Ico = CAP_ICONS[s.cap];
          const tone = s.cap === 'write' ? 'var(--color-text-warning)'
                     : s.cap === 'exec'  ? 'var(--color-text-danger)'
                     : 'var(--color-text-secondary)';
          return (
            <div key={i} style={{
              borderBottom: i < steps.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
              padding: 'var(--space-3) 0',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                <Checkbox checked={s.checked} />
                <span className="t-mono-sm c-muted tnum" style={{ width: 22 }}>{String(i+1).padStart(2,'0')}</span>
                <span className="t-body c-primary" style={{ flex: 1 }}>{s.t}</span>
                {s.needsAsk && <Pill variant="warning">will ask</Pill>}
                <span className="t-mono-sm c-muted" style={{ cursor: 'pointer' }}>▾</span>
              </div>
              {s.expanded && (
                <div className="surface--inset" style={{
                  marginLeft: 42, marginTop: 'var(--space-2)',
                  padding: 'var(--space-3)',
                  borderRadius: 'var(--radius-md)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                    <Ico size={12} color={tone} />
                    <span className="t-mono-sm c-secondary">via</span>
                    <span className="t-mono-sm c-primary">{s.tool}</span>
                  </div>
                  <div className="t-mono-sm c-secondary" style={{ marginTop: 4 }}>
                    {dryRun ? 'would create /Scripts/DoorOpenTimeline.py (±42 lines)' : 'creates /Scripts/DoorOpenTimeline.py'}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div style={{
        padding: 'var(--space-3) var(--space-4)',
        borderTop: '1px solid rgba(255,255,255,0.04)',
        background: 'rgba(0,0,0,0.30)',
        display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
      }}>
        {dryRun
          ? <span className="t-mono-sm c-muted">no project files were touched</span>
          : <span className="t-mono-sm c-muted">4 of 5 selected</span>}
        <div style={{ flex: 1 }} />
        <Button variant="ghost" disabled>Edit plan · v2</Button>
        <Button variant="secondary">Cancel</Button>
        <Button variant="primary">{dryRun ? 'Run for real' : 'Approve selected'}</Button>
      </div>
    </div>
  );
}

// ── Error surfaces ───────────────────────────────────────────────
function ToolFailure() {
  return (
    <div style={{
      width: 580,
      background: 'rgba(40, 14, 14, 0.55)',
      border: '1px solid var(--color-border-danger)',
      borderRadius: 'var(--radius-lg)',
      boxShadow: 'var(--highlight-top), var(--shadow-md)',
      overflow: 'hidden',
    }}>
      <div style={{
        padding: 'var(--space-3) var(--space-4)',
        display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
        borderBottom: '1px solid rgba(232,113,113,0.16)',
      }}>
        <span style={{
          width: 18, height: 18, borderRadius: '50%',
          background: 'var(--color-danger-default)', color: 'var(--color-bg-base)',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700,
          boxShadow: '0 0 8px rgba(232,113,113,0.45)',
        }}>!</span>
        <span className="t-mono c-primary">run_python</span>
        <span className="t-body-sm c-danger">failed · step 3 of 5</span>
        <div style={{ flex: 1 }} />
        <span className="t-mono-sm c-muted tnum">14:02:58.412</span>
      </div>

      <div className="surface--inset" style={{
        margin: 'var(--space-3) var(--space-4)',
        padding: 'var(--space-3) var(--space-4)',
        borderRadius: 'var(--radius-md)',
      }}>
        <div className="t-mono-sm c-danger">TimelineError: cannot bind property 'DoorOpen' — target has no component 'MeshRoot'</div>
        <div className="t-mono-sm c-muted" style={{ marginTop: 'var(--space-2)' }}>at timeline_scaffold.py:42</div>
      </div>

      <div style={{
        padding: 'var(--space-3) var(--space-4)',
        display: 'flex', gap: 'var(--space-2)',
        borderTop: '1px solid rgba(232,113,113,0.10)',
      }}>
        <Button variant="primary">Retry</Button>
        <Button variant="secondary">Skip step</Button>
        <Button variant="secondary">Ask Myika to fix</Button>
        <div style={{ flex: 1 }} />
        <Button variant="ghost">Abort run</Button>
      </div>
    </div>
  );
}

function ModalFrame({ width = 460, accent = 'default', eyebrow, title, icon, children, buttons }) {
  const borderColor = accent === 'danger' ? 'var(--color-border-danger)' : 'var(--color-border-default)';
  const eyebrowColor = accent === 'danger' ? 'var(--color-text-danger)' : 'var(--color-text-accent)';
  return (
    <div role="dialog" aria-modal="true" className="surface--modal" style={{ width, borderColor }}>
      <div style={{ padding: 'var(--space-5) var(--space-5) var(--space-3)' }}>
        {eyebrow && <Eyebrow style={{ color: eyebrowColor, opacity: 1, display: 'block', marginBottom: 8 }}>{eyebrow}</Eyebrow>}
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          {icon}
          <span className="t-h1 c-primary">{title}</span>
        </div>
      </div>
      <div style={{ padding: '0 var(--space-5) var(--space-4)' }}>{children}</div>
      <div style={{
        padding: 'var(--space-3) var(--space-5)',
        borderTop: '1px solid var(--color-border-subtle)',
        display: 'flex', gap: 'var(--space-2)', justifyContent: 'flex-end',
      }}>{buttons}</div>
    </div>
  );
}

function BridgeLost() {
  return (
    <ModalFrame
      width={480} accent="danger"
      eyebrow="Bridge · disconnected"
      title="Lost connection to Unreal"
      icon={<Heartbeat variant="danger" label="" latencyMs={null} />}
      buttons={<><Button variant="secondary">Abort run</Button><Button variant="primary">Retry connection</Button></>}>
      <div className="t-body c-primary">Run paused at <span className="mono t-mono">step 3 of 5</span> — <span className="mono t-mono">add Timeline</span>.</div>
      <div className="t-body-sm c-secondary" style={{ marginTop: 'var(--space-3)' }}>
        Your project is safe. Files modified so far can be rolled back via git checkpoint on abort.
      </div>
      <div className="surface--inset" style={{
        marginTop: 'var(--space-4)',
        padding: 'var(--space-3) var(--space-4)',
        borderRadius: 'var(--radius-md)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <Eyebrow>Last seen</Eyebrow>
          <span className="t-mono-sm c-secondary tnum">14:02:58</span>
          <span className="t-mono-sm c-muted">·</span>
          <span className="t-mono-sm c-muted tnum">PORT 8451</span>
        </div>
        <div style={{ marginTop: 'var(--space-2)', display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <Heartbeat variant="danger" label="RETRYING" latencyMs={null} />
          <span className="t-mono-sm c-muted tnum">3 / 10</span>
        </div>
      </div>
    </ModalFrame>
  );
}

function Rollback() {
  const icon = <span style={{
    width: 28, height: 28, borderRadius: '50%',
    background: 'var(--color-bg-raised)',
    border: '1px solid var(--color-border-default)',
    color: 'var(--color-text-primary)',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 14,
    boxShadow: 'var(--highlight-top), var(--shadow-sm)',
  }}>↺</span>;
  const files = [['~', 'BP_InteractableDoor.uasset'], ['+', 'DoorOpenTimeline.py'], ['~', 'InteractionRegistry.ini'], ['+', 'TriggerBox_220x90.uasset']];
  return (
    <ModalFrame
      width={480}
      eyebrow="Rollback · revert run"
      title="Revert this run?"
      icon={icon}
      buttons={<><Button variant="secondary">Keep changes</Button><Button variant="primary">Revert via git</Button></>}>
      <div className="t-body c-primary">
        This will undo <span className="mono t-mono">4 file changes</span> from run <span className="mono t-mono">#a3f21</span>.
      </div>
      <div className="surface--inset" style={{
        marginTop: 'var(--space-4)',
        padding: 'var(--space-3) var(--space-4)',
        borderRadius: 'var(--radius-md)',
      }}>
        {files.map(([t, p], i) => (
          <div key={i} style={{ display: 'flex', gap: 'var(--space-3)', padding: '2px 0' }}>
            <span className="t-mono-sm tnum" style={{ color: t === '+' ? 'var(--color-diff-added)' : 'var(--color-diff-modified)', width: 8 }}>{t}</span>
            <span className="t-mono-sm c-primary">{p}</span>
          </div>
        ))}
      </div>
      <div className="t-mono-sm c-muted" style={{ marginTop: 'var(--space-3)', display: 'flex', gap: 'var(--space-2)' }}>
        <Eyebrow mono>Checkpoint</Eyebrow>
        <span className="tnum">myika/run-a3f21 @ 14:02:11</span>
      </div>
    </ModalFrame>
  );
}

// ── Onboarding ───────────────────────────────────────────────────
function OnboardShell({ n, total, eyebrow, title, children, primary = 'Continue', primaryDisabled, secondary }) {
  return (
    <div className="surface--modal" style={{
      width: 580, height: 460,
      display: 'flex', flexDirection: 'column',
    }}>
      <div style={{
        padding: 'var(--space-4) var(--space-6)',
        borderBottom: '1px solid var(--color-border-subtle)',
        display: 'flex', alignItems: 'center', gap: 'var(--space-4)',
      }}>
        <Eyebrow mono>Step {String(n).padStart(2,'0')} / {String(total).padStart(2,'0')}</Eyebrow>
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', gap: 6 }}>
          {Array.from({ length: total }).map((_, i) => (
            <span key={i} style={{
              width: 22, height: 3, borderRadius: 'var(--radius-sm)',
              background: i < n ? 'var(--color-accent-default)' : 'var(--color-bg-raised)',
              boxShadow: i < n ? '0 0 6px rgba(74,222,128,0.45)' : 'inset 0 1px 1px rgba(0,0,0,0.4)',
            }} />
          ))}
        </div>
      </div>

      <div style={{ flex: 1, padding: 'var(--space-8) var(--space-10) var(--space-6)', display: 'flex', flexDirection: 'column' }}>
        {eyebrow && <Eyebrow style={{ color: 'var(--color-text-accent)', opacity: 1, marginBottom: 10 }}>{eyebrow}</Eyebrow>}
        <div className="t-display c-primary">{title}</div>
        <div style={{ marginTop: 'var(--space-4)', flex: 1 }}>{children}</div>
      </div>

      <div style={{
        padding: 'var(--space-3) var(--space-6)',
        borderTop: '1px solid var(--color-border-subtle)',
        background: 'rgba(0,0,0,0.20)',
        display: 'flex', gap: 'var(--space-2)',
      }}>
        {secondary && <Button variant="secondary">{secondary}</Button>}
        <div style={{ flex: 1 }} />
        <Button variant="primary" size="lg" disabled={primaryDisabled}>{primary}</Button>
      </div>
    </div>
  );
}

const OnbWelcome = () => (
  <OnboardShell n={1} total={4} eyebrow="Welcome" title="Myika for Unreal.">
    <div className="t-body-lg c-secondary">
      An AI teammate for UE5 that reads your project, proposes changes, and — with your approval — makes them.
    </div>
    <div className="t-body-lg c-secondary" style={{ marginTop: 'var(--space-3)' }}>
      Three short steps: API key, plugin install, connection test.
    </div>
    <div style={{
      marginTop: 'var(--space-5)',
      padding: 'var(--space-3) var(--space-4)',
      background: 'var(--color-bg-elevated)',
      border: '1px solid var(--color-border-subtle)',
      borderRadius: 'var(--radius-md)',
      boxShadow: 'var(--highlight-top), var(--shadow-sm)',
    }}>
      <Eyebrow>What you'll need</Eyebrow>
      <div className="t-body-sm c-secondary" style={{ marginTop: 'var(--space-2)' }}>· An Anthropic API key</div>
      <div className="t-body-sm c-secondary">· A UE 5.7 project you can edit</div>
      <div className="t-body-sm c-secondary">· 2 minutes</div>
    </div>
  </OnboardShell>
);

const OnbKey = () => (
  <OnboardShell n={2} total={4} eyebrow="Authenticate" title="Paste your Anthropic API key." secondary="Back">
    <div className="t-body c-secondary">Stored in your OS keychain. Never leaves this machine.</div>
    <div style={{ marginTop: 'var(--space-4)' }}>
      <InputWithBtn type="password" button="Test" width={380} />
      <div style={{ marginTop: 'var(--space-3)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
        <span className="t-mono-sm c-accent">✓ valid</span>
        <span className="t-mono-sm c-muted">· sonnet-4.6 available</span>
      </div>
    </div>
    <div className="t-caption c-muted" style={{ marginTop: 'var(--space-6)' }}>
      Don't have one? <span className="mono t-mono c-secondary">console.anthropic.com</span>
    </div>
  </OnboardShell>
);

const OnbPlugin = ({ connected = false }) => (
  <OnboardShell n={3} total={4}
    eyebrow="Bridge install"
    title="Install the Myika plugin."
    secondary="Back"
    primary={connected ? 'Continue' : 'Waiting…'}
    primaryDisabled={!connected}>
    <div className="t-body c-secondary">Run this in your project folder to symlink the plugin:</div>
    <div className="surface--inset" style={{
      position: 'relative',
      marginTop: 'var(--space-3)',
      padding: 'var(--space-3) var(--space-4)',
      borderRadius: 'var(--radius-md)',
    }}>
      <span className="t-mono c-primary">myika install-plugin --project ./Meridian_Prototype</span>
      <span className="t-mono-sm c-muted" style={{ position: 'absolute', top: 10, right: 12, cursor: 'pointer' }}>copy ⎘</span>
    </div>
    <div className="t-caption c-muted" style={{ marginTop: 'var(--space-2)' }}>
      Then restart UE → Edit → Plugins → enable "Myika".
    </div>
    <div style={{
      marginTop: 'var(--space-5)',
      padding: 'var(--space-3) var(--space-4)',
      background: connected ? 'var(--color-bg-accent-deep)' : 'var(--color-bg-elevated)',
      border: `1px solid ${connected ? 'var(--color-border-accent)' : 'var(--color-border-subtle)'}`,
      borderRadius: 'var(--radius-md)',
      boxShadow: connected ? 'var(--highlight-top), var(--shadow-md), 0 0 24px -8px rgba(74,222,128,0.30)' : 'var(--highlight-top), var(--shadow-sm)',
      display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
    }}>
      {connected
        ? <Heartbeat label="CONNECTED · MERIDIAN_PROTOTYPE · UE 5.7.0" latencyMs={11} />
        : <>
            <TypingDots />
            <span className="t-mono-sm c-secondary tnum">WAITING FOR PLUGIN HANDSHAKE ON :8451…</span>
          </>}
    </div>
  </OnboardShell>
);

const OnbDone = () => (
  <OnboardShell n={4} total={4} eyebrow="Ready" title="You're set." primary="Open chat">
    <div style={{
      padding: 'var(--space-3) var(--space-4)',
      background: 'var(--color-bg-accent-deep)',
      border: '1px solid var(--color-border-accent)',
      borderRadius: 'var(--radius-md)',
      boxShadow: 'var(--highlight-top), var(--shadow-sm)',
    }}>
      <Heartbeat label="CONNECTED" latencyMs={11} />
      <div className="t-body c-secondary" style={{ marginTop: 'var(--space-2)' }}>
        Meridian_Prototype · UE 5.7.0 · plugin v0.4.2
      </div>
    </div>
    <div className="t-body c-secondary" style={{ marginTop: 'var(--space-4)' }}>
      Try: <span className="mono t-mono c-primary">"make the oak door interactable when the player presses E"</span> — Myika will propose a plan and wait for approval before touching your project.
    </div>
    <div style={{ marginTop: 'var(--space-5)' }}>
      <Eyebrow>Defaults set for you</Eyebrow>
      <div style={{ marginTop: 'var(--space-2)', display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <IconRead size={12} color="var(--color-text-secondary)" />
          <span className="t-body-sm c-secondary">Read tools</span>
          <span className="t-mono-sm c-muted">→</span>
          <span className="t-mono-sm c-accent">allow</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <IconWrite size={12} color="var(--color-text-warning)" />
          <span className="t-body-sm c-secondary">Write tools</span>
          <span className="t-mono-sm c-muted">→</span>
          <span className="t-mono-sm c-warning">ask every time</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <IconExec size={12} color="var(--color-text-danger)" />
          <span className="t-body-sm c-secondary">Execute tools</span>
          <span className="t-mono-sm c-muted">→</span>
          <span className="t-mono-sm c-danger">ask every time</span>
        </div>
      </div>
    </div>
  </OnboardShell>
);

Object.assign(window, {
  Settings, SET_W, SET_H,
  PermissionModal, PlanExpanded, ToolFailure, BridgeLost, Rollback,
  OnbWelcome, OnbKey, OnbPlugin, OnbDone,
});
