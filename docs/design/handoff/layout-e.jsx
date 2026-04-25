/* Layout E production v2 — 6 states.
 *
 * v2: depth (layered surfaces, inner highlights, drop shadows),
 *     motion in stills (heartbeat keyframe in mid-cycle, fade-trail on
 *     streaming, scanline+progress on running chips, bottom-glow on
 *     primary button at rest), SMALL CAPS section labels.
 */

const LE_W = 1280, LE_H = 820;

// ── Plan card (compact, for chat) — accent-deep surface ──────────
const PlanCardChat = () => {
  const files = [
    { m: '~', p: 'Blueprints/BP_InteractableDoor.uasset' },
    { m: '+', p: 'Scripts/DoorOpenTimeline.py' },
    { m: '~', p: 'Config/InteractionRegistry.ini' },
    { m: '+', p: 'Blueprints/TriggerBox_220x90.uasset' },
  ];
  return (
    <div style={{
      background: 'var(--color-bg-accent-deep)',
      border: '1px solid var(--color-border-accent)',
      borderRadius: 'var(--radius-lg)',
      boxShadow: 'var(--highlight-top), var(--shadow-lg), 0 0 0 1px rgba(74,222,128,0.04)',
      overflow: 'hidden', maxWidth: 580,
    }}>
      <div style={{
        padding: 'var(--space-3) var(--space-4)',
        background: 'linear-gradient(180deg, rgba(74,222,128,0.08), rgba(74,222,128,0.02))',
        display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
        borderBottom: '1px solid rgba(74,222,128,0.12)',
      }}>
        <Eyebrow style={{ color: 'var(--color-text-accent)', opacity: 1 }}>Plan · 5 steps</Eyebrow>
        <div style={{ flex: 1 }} />
        <span className="t-mono-sm c-muted tnum">~40s</span>
      </div>

      <div style={{ padding: 'var(--space-3) var(--space-4)' }}>
        {[
          'Duplicate SM_Door_Oak → BP_InteractableDoor',
          'Reparent to InteractableActor',
          'Add Timeline "DoorOpen" (1.0s)',
          'Add BoxComponent Trigger (220×90×10)',
          'Register with Interaction subsystem',
        ].map((t, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', padding: '4px 0' }}>
            <span className="t-mono-sm c-muted tnum" style={{ width: 18 }}>{String(i+1).padStart(2,'0')}</span>
            <span className="t-body c-primary" style={{ flex: 1 }}>{t}</span>
            {i === 2 && <Pill variant="warning">will ask</Pill>}
          </div>
        ))}
      </div>

      <div style={{
        padding: 'var(--space-3) var(--space-4)',
        borderTop: '1px solid rgba(255,255,255,0.04)',
        background: 'rgba(0,0,0,0.20)',
      }}>
        <Eyebrow>Files affected · 4</Eyebrow>
        <div style={{ marginTop: 'var(--space-2)', display: 'grid', gridTemplateColumns: '1fr 1fr', rowGap: 3, columnGap: 'var(--space-3)' }}>
          {files.map((f, i) => (
            <div key={i} style={{ display: 'flex', gap: 'var(--space-2)' }}>
              <span className="t-mono-sm tnum" style={{ color: f.m === '+' ? 'var(--color-diff-added)' : 'var(--color-diff-modified)', width: 8 }}>{f.m}</span>
              <span className="t-mono-sm c-secondary" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.p}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{
        padding: 'var(--space-3) var(--space-4)',
        borderTop: '1px solid rgba(255,255,255,0.04)',
        display: 'flex', gap: 'var(--space-2)', alignItems: 'center',
        background: 'rgba(0,0,0,0.30)',
      }}>
        <span className="t-mono-sm c-muted">reversible · git checkpoint</span>
        <div style={{ flex: 1 }} />
        <Button variant="secondary">Dry-run</Button>
        <Button variant="primary">Approve <Kbd>⌘↵</Kbd></Button>
      </div>
    </div>
  );
};

// ── Tool call expanded ───────────────────────────────────────────
const ToolExpanded = ({ name, args, result, running }) => (
  <div className="surface" style={{ overflow: 'hidden', maxWidth: 580 }}>
    <div style={{
      padding: 'var(--space-2) var(--space-3)',
      display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
      borderBottom: '1px solid var(--color-border-subtle)',
    }}>
      <ToolChip name={name} status={running ? 'running' : 'done'} />
      <Cap kind="read" withIcon>read</Cap>
      <div style={{ flex: 1 }} />
      <span className="t-mono-sm c-muted tnum">{running ? '312MS…' : '284MS'}</span>
      <span className="t-mono-sm c-muted">▾</span>
    </div>
    <div className="surface--inset" style={{
      padding: 'var(--space-3)',
      borderRadius: 0,
      borderLeft: 'none', borderRight: 'none',
      borderTop: 'none',
    }}>
      <Eyebrow>Args</Eyebrow>
      <pre className="t-mono-lg" style={{ margin: 'var(--space-2) 0 0', color: 'var(--color-syntax-plain)' }}>{args}</pre>
    </div>
    {result && (
      <div style={{ padding: 'var(--space-3)' }}>
        <Eyebrow>Result</Eyebrow>
        <pre className="t-mono-lg c-secondary" style={{ margin: 'var(--space-2) 0 0' }}>{result}</pre>
      </div>
    )}
  </div>
);

// ── Right-column module shell ────────────────────────────────────
const Module = ({ title, count, children, action }) => (
  <div style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
    <div style={{
      padding: 'var(--space-3) var(--space-4) var(--space-2)',
      display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
    }}>
      <Eyebrow count={count}>{title}</Eyebrow>
      <div style={{ flex: 1 }} />
      {action}
    </div>
    {children}
  </div>
);

// ── Right column modules ─────────────────────────────────────────
const ProjectTreeModule = () => {
  const rows = [
    { p: '/Content', k: 0, t: 'folder' },
    { p: 'Blueprints', k: 1, t: 'folder' },
    { p: 'BP_InteractableDoor', k: 2, t: 'bp', scope: true, tag: 'new' },
    { p: 'BP_EnemyAI', k: 2, t: 'bp' },
    { p: 'Meshes/Doors', k: 1, t: 'folder', scope: true },
    { p: 'SM_Door_Oak', k: 2, t: 'mesh', scope: true },
    { p: 'SM_Door_Iron', k: 2, t: 'mesh' },
    { p: 'Config', k: 1, t: 'folder' },
    { p: 'InteractionRegistry.ini', k: 2, t: 'ini', scope: true },
  ];
  return (
    <Module title="Project tree">
      <div style={{ paddingBottom: 'var(--space-2)' }}>
        {rows.map((r, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
            padding: '3px var(--space-4)',
            paddingLeft: `calc(var(--space-4) + ${r.k * 12}px)`,
            background: r.scope ? 'var(--color-accent-soft)' : 'transparent',
            borderLeft: r.scope ? '2px solid var(--color-accent-default)' : '2px solid transparent',
            marginLeft: r.scope ? 0 : 0,
            paddingLeft: `calc(var(--space-4) + ${r.k * 12}px - ${r.scope ? 2 : 0}px)`,
            position: 'relative',
          }}>
            <span className="t-mono-sm c-muted">{r.t === 'folder' ? '▸' : '·'}</span>
            <span className="t-mono-sm" style={{
              color: r.scope ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
              flex: 1,
            }}>{r.p}</span>
            {r.tag && <Pill variant="accent">{r.tag}</Pill>}
          </div>
        ))}
      </div>
    </Module>
  );
};

const ScopeModule = () => (
  <Module title="In scope" count={3}>
    <div style={{ padding: '0 var(--space-4) var(--space-3)', display: 'flex', flexWrap: 'wrap', gap: 'var(--space-1)' }}>
      {['SM_Door_Oak', '/Meshes/Doors', 'InteractionRegistry.ini'].map(s => (
        <span key={s} style={{
          fontFamily: 'var(--font-mono)', fontSize: 11,
          padding: '2px var(--space-2)',
          background: 'var(--color-bg-raised)',
          border: '1px solid var(--color-border-subtle)',
          borderRadius: 'var(--radius-sm)',
          color: 'var(--color-text-secondary)',
          boxShadow: 'var(--highlight-top)',
        }}>{s}</span>
      ))}
    </div>
  </Module>
);

const ToolsModule = () => {
  const tools = [
    ['list_assets',     'read'],
    ['read_blueprint',  'read'],
    ['search_assets',   'search'],
    ['duplicate_asset', 'write'],
    ['reparent_bp',     'write'],
    ['spawn_actor',     'write'],
    ['run_python',      'exec'],
    ['emit_code',       'code'],
  ];
  return (
    <Module title="Tools enabled" count={tools.length}>
      <div style={{ padding: '0 var(--space-4) var(--space-3)' }}>
        {tools.map(([n, c]) => {
          const Ico = CAP_ICONS[c];
          const tone = c === 'write' ? 'var(--color-text-warning)'
                     : c === 'exec'  ? 'var(--color-text-danger)'
                     : 'var(--color-text-secondary)';
          return (
            <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', padding: '4px 0' }}>
              <span style={{ width: 14, color: tone, display: 'inline-flex' }}><Ico size={14} color={tone} /></span>
              <span className="t-mono-sm c-primary" style={{ flex: 1 }}>{n}</span>
              <Cap kind={c === 'search' || c === 'code' ? 'read' : c}>{c}</Cap>
            </div>
          );
        })}
      </div>
    </Module>
  );
};

// ── Message bubbles ──────────────────────────────────────────────
const UserMsg = ({ children }) => (
  <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 'var(--space-5)' }}>
    <div style={{
      maxWidth: '70%',
      background: 'var(--color-bg-raised)',
      border: '1px solid var(--color-border-subtle)',
      borderRadius: 'var(--radius-lg)',
      padding: 'var(--space-3) var(--space-4)',
      boxShadow: 'var(--highlight-top), var(--shadow-sm)',
    }} className="t-body-lg c-primary">{children}</div>
  </div>
);

const AssistantMsg = ({ children }) => (
  <div style={{ marginBottom: 'var(--space-5)', maxWidth: '85%' }} className="t-body-lg c-primary">
    {children}
  </div>
);

// ── Composer — INSET, recessed feel ──────────────────────────────
const Composer = ({ placeholder = 'Ask Myika to build something…', value }) => (
  <div style={{
    padding: 'var(--space-3) var(--space-4)',
    borderTop: '1px solid var(--color-border-subtle)',
    background: 'var(--color-bg-base)',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.02)',
    display: 'flex', alignItems: 'flex-end', gap: 'var(--space-3)',
  }}>
    <div style={{
      flex: 1, minHeight: 36,
      padding: 'var(--space-2) var(--space-3)',
      background: 'var(--color-bg-void)',
      border: '1px solid var(--color-border-default)',
      borderRadius: 'var(--radius-md)',
      boxShadow: 'var(--shadow-inset-sm)',
      display: 'flex', alignItems: 'center',
    }}>
      {value ? <span className="t-body c-primary">{value}<Cursor /></span> : <span className="t-body c-muted">{placeholder}</span>}
    </div>
    <Button variant="primary" disabled={!value}>Send <Kbd>↵</Kbd></Button>
  </div>
);

// ── Layout frame ─────────────────────────────────────────────────
const LayoutFrame = ({ connected = true, activity, children, model, latencyMs }) => (
  <div style={{ width: LE_W, height: LE_H, background: 'var(--color-bg-base)', display: 'flex', flexDirection: 'column' }}>
    <TopBar title="myika · Meridian_Prototype" right={
      <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
        <Button icon title="settings">⚙</Button>
      </div>
    } />
    <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
      {children}
    </div>
    <BottomBar connected={connected} activity={activity} model={model} latencyMs={latencyMs} />
  </div>
);

const ChatColumn = ({ children, footer }) => (
  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, background: 'var(--color-bg-surface)', boxShadow: 'inset 1px 0 0 rgba(255,255,255,0.02)' }}>
    <div style={{ flex: 1, overflow: 'auto', padding: 'var(--space-6) var(--space-8)' }}>
      {children}
    </div>
    {footer}
  </div>
);

const RightColumn = ({ children }) => (
  <div style={{ flex: '0 0 296px', borderLeft: '1px solid var(--color-border-subtle)', background: 'var(--color-bg-base)', overflow: 'auto' }}>
    {children}
  </div>
);

// ── States ───────────────────────────────────────────────────────
function StateEmpty() {
  return (
    <LayoutFrame activity="idle" latencyMs={11}>
      <ChatColumn footer={<Composer />}>
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center', maxWidth: 560, margin: '0 auto' }}>
          <div style={{ marginBottom: 'var(--space-5)' }}>
            <Heartbeat label="CONNECTED · MERIDIAN_PROTOTYPE" latencyMs={11} />
          </div>
          <h1 className="t-display c-primary" style={{ margin: 0 }}>What should we build?</h1>
          <p className="t-body-lg c-secondary" style={{ marginTop: 'var(--space-3)', marginBottom: 'var(--space-8)', maxWidth: 460 }}>
            Myika reads your project and proposes changes. You approve before anything touches disk.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)', justifyContent: 'center' }}>
            {['Make this door interactable', 'List unused assets', 'Convert BP_EnemyAI to C++', 'Scaffold a dialog system'].map(s => (
              <span key={s} style={{
                padding: '6px var(--space-3)',
                background: 'var(--color-bg-raised)',
                border: '1px solid var(--color-border-subtle)',
                borderRadius: 'var(--radius-full)',
                color: 'var(--color-text-secondary)', fontSize: 12,
                cursor: 'pointer',
                boxShadow: 'var(--highlight-top)',
              }}>{s}</span>
            ))}
          </div>
        </div>
      </ChatColumn>
      <RightColumn>
        <ProjectTreeModule />
        <ScopeModule />
        <ToolsModule />
      </RightColumn>
    </LayoutFrame>
  );
}

function StateMid() {
  return (
    <LayoutFrame activity="6 messages" latencyMs={14}>
      <ChatColumn footer={<Composer />}>
        <UserMsg>make the oak door interactable when the player presses E</UserMsg>
        <AssistantMsg>
          I'll scan the door meshes first. Called <ToolChip name="list_assets" /> and <ToolChip name="read_blueprint" /> — found <span className="mono t-mono c-primary">SM_Door_Oak</span> with no interaction component yet.
          <div style={{ marginTop: 'var(--space-4)' }}>
            Here's what I'd do:
          </div>
          <div style={{ marginTop: 'var(--space-3)' }}>
            <PlanCardChat />
          </div>
        </AssistantMsg>
      </ChatColumn>
      <RightColumn>
        <ProjectTreeModule />
        <ScopeModule />
        <ToolsModule />
      </RightColumn>
    </LayoutFrame>
  );
}

function StateExpanded() {
  return (
    <LayoutFrame activity="expanded tool call" latencyMs={12}>
      <ChatColumn footer={<Composer />}>
        <UserMsg>show me what read_blueprint returned</UserMsg>
        <AssistantMsg>
          <div style={{ marginBottom: 'var(--space-3)' }}>Here's the full call:</div>
          <ToolExpanded
            name="read_blueprint"
            args={`{\n  "path": "/Content/Meshes/Doors/SM_Door_Oak",\n  "include_components": true,\n  "depth": 2\n}`}
            result={`{\n  "class": "StaticMeshActor",\n  "components": ["MeshRoot", "Collision"],\n  "interactable": false,\n  "size": { "x": 220, "y": 10, "z": 210 }\n}`}
          />
          <div style={{ marginTop: 'var(--space-3)' }}>
            No interaction component. I'll need to reparent it and add a Timeline.
          </div>
        </AssistantMsg>
      </ChatColumn>
      <RightColumn>
        <ProjectTreeModule />
        <ScopeModule />
        <ToolsModule />
      </RightColumn>
    </LayoutFrame>
  );
}

function StatePlan() {
  return (
    <LayoutFrame activity="awaiting approval" latencyMs={14}>
      <ChatColumn footer={<Composer />}>
        <UserMsg>make the oak door interactable when the player presses E</UserMsg>
        <AssistantMsg>
          I inspected the mesh and the interaction subsystem. Here's the plan:
          <div style={{ marginTop: 'var(--space-3)' }}>
            <PlanCardChat />
          </div>
        </AssistantMsg>
      </ChatColumn>
      <RightColumn>
        <ProjectTreeModule />
        <ScopeModule />
        <ToolsModule />
      </RightColumn>
    </LayoutFrame>
  );
}

function StateStreaming() {
  // The fade trail: words at the very end fade in (older = full opacity).
  // The newest 3 words get progressively lower opacity.
  return (
    <LayoutFrame activity={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><TypingDots /> running step 3 of 5</span>} latencyMs={13}>
      <ChatColumn footer={<Composer placeholder="streaming…" />}>
        <UserMsg>go ahead</UserMsg>
        <AssistantMsg>
          Running the plan. <ToolChip name="duplicate_asset" status="done" /> <ToolChip name="reparent_bp" status="done" /> <ToolChip name="run_python" status="running" />
          <div style={{ marginTop: 'var(--space-3)' }}>
            Generating the Timeline node now — adding the curve keys at <span className="mono t-mono c-secondary">0.0s</span>, <span className="mono t-mono c-secondary">0.5s</span> and{' '}
            <span className="fade-trail-3">finalizing</span>{' '}
            <span className="fade-trail-2">the rotation</span>{' '}
            <span className="fade-trail-1">curve at</span>
            <Cursor />
          </div>
        </AssistantMsg>
      </ChatColumn>
      <RightColumn>
        <ProjectTreeModule />
        <ScopeModule />
        <ToolsModule />
      </RightColumn>
    </LayoutFrame>
  );
}

function StateDisconnected() {
  return (
    <LayoutFrame connected={false} activity="reconnecting (3/10)">
      <ChatColumn footer={<Composer placeholder="bridge offline — paused" />}>
        <UserMsg>add a trigger volume</UserMsg>
        <AssistantMsg>
          <div style={{
            padding: 'var(--space-4) var(--space-4)',
            background: 'rgba(40, 14, 14, 0.55)',
            border: '1px solid var(--color-border-danger)',
            borderRadius: 'var(--radius-lg)',
            boxShadow: 'var(--highlight-top), var(--shadow-md)',
            maxWidth: 580,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <Heartbeat variant="danger" label="LOST CONNECTION" latencyMs={null} />
            </div>
            <div className="t-body c-primary" style={{ marginTop: 'var(--space-3)' }}>
              Run paused at step 3 of 5 — <span className="mono t-mono">add Timeline</span>.
            </div>
            <div className="t-body-sm c-secondary" style={{ marginTop: 'var(--space-1)' }}>
              Files modified so far are safe — rollback available on abort.
            </div>
            <div style={{ marginTop: 'var(--space-4)', display: 'flex', gap: 'var(--space-2)' }}>
              <Button variant="primary">Retry connection</Button>
              <Button variant="destructive">Abort run</Button>
            </div>
          </div>
        </AssistantMsg>
      </ChatColumn>
      <RightColumn>
        <ProjectTreeModule />
        <ScopeModule />
        <ToolsModule />
      </RightColumn>
    </LayoutFrame>
  );
}

Object.assign(window, {
  LE_W, LE_H,
  StateEmpty, StateMid, StateExpanded, StatePlan, StateStreaming, StateDisconnected,
  PlanCardChat, ToolExpanded, UserMsg, AssistantMsg, Composer,
  LayoutFrame, ChatColumn, RightColumn,
  ProjectTreeModule, ScopeModule, ToolsModule, Module,
});
