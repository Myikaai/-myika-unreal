/*
 * Layout E — Main window
 *
 * The primary screen. Top bar + chat column + right sidebar + bottom bar.
 * Structure is locked from wireframes, visual treatment is what we're refining.
 *
 * Key depth elements:
 * - Chat column (bg-surface) feels forward
 * - Right column (bg-base) feels set back via tone and shadow
 * - Cards (bg-elevated) float above chat surface
 */

import './LayoutE.css';
import { BridgeIndicator } from './BridgeIndicator';
import { ToolChip } from './ToolChip';
import { ApproveButton } from './ApproveButton';
import { StreamingText } from './StreamingText';

interface LayoutEProps {
  state: 'mid-conversation' | 'running' | 'streaming';
}

export function LayoutE({ state }: LayoutEProps) {
  return (
    <div className="layout-e">
      {/* Top bar */}
      <div className="layout-e__topbar">
        <div className="layout-e__topbar-dots">
          <span style={{ background: '#F87171' }} />
          <span style={{ background: '#FBBF24' }} />
          <span style={{ background: '#4ADE80' }} />
        </div>
        <span className="layout-e__topbar-title">myika · Meridian_Prototype</span>
        <div className="layout-e__topbar-actions">
          <button className="layout-e__icon-button">⚙</button>
        </div>
      </div>

      {/* Main content area */}
      <div className="layout-e__main">
        {/* Chat column */}
        <div className="layout-e__chat">
          <div className="layout-e__messages">
            {/* User message */}
            <div className="layout-e__message layout-e__message--user">
              <div className="layout-e__message-bubble layout-e__message-bubble--user">
                make the oak door interactable when the player presses E
              </div>
            </div>

            {/* Assistant message */}
            <div className="layout-e__message layout-e__message--assistant">
              <div className="layout-e__message-content">
                {state === 'streaming' ? (
                  <StreamingText text="I'll scan the door meshes first. Called and — found SM_Door_Oak with no" />
                ) : (
                  <>
                    I'll scan the door meshes first. Called{' '}
                    <ToolChip name="list_assets" status={state === 'running' ? 'running' : 'done'} capability="read" />{' '}
                    and <ToolChip name="read_blueprint" status="done" capability="read" /> — found{' '}
                    <code className="layout-e__inline-code">SM_Door_Oak</code> with no interaction component yet.
                  </>
                )}
              </div>

              {state !== 'streaming' && (
                <>
                  <div className="layout-e__message-content" style={{ marginTop: 'var(--space-3)' }}>
                    Here's what I'd do:
                  </div>

                  {/* Plan card */}
                  <div className="layout-e__plan-card">
                    <div className="layout-e__plan-header">
                      <span className="layout-e__plan-label">PLAN · 5 STEPS</span>
                      <span className="layout-e__plan-time">~40s</span>
                    </div>

                    <div className="layout-e__plan-steps">
                      {[
                        'Duplicate SM_Door_Oak → BP_InteractableDoor',
                        'Reparent to InteractableActor',
                        'Add Timeline "DoorOpen" (1.0s)',
                        'Add BoxComponent Trigger (220×90×10)',
                        'Register with Interaction subsystem',
                      ].map((step, i) => (
                        <div key={i} className="layout-e__plan-step">
                          <span className="layout-e__plan-step-num">{i + 1}.</span>
                          <span className="layout-e__plan-step-text">{step}</span>
                          {i === 2 && <span className="layout-e__plan-step-badge">will ask</span>}
                        </div>
                      ))}
                    </div>

                    <div className="layout-e__plan-footer">
                      <span className="layout-e__plan-footer-text">
                        reversible via git checkpoint
                      </span>
                      <div style={{ flex: 1 }} />
                      <button className="layout-e__button layout-e__button--secondary">
                        Dry-run
                      </button>
                      <ApproveButton>
                        Approve <kbd>⌘↵</kbd>
                      </ApproveButton>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Composer */}
          <div className="layout-e__composer">
            <div className="layout-e__composer-input">
              <span className="layout-e__composer-placeholder">
                Ask Myika to build something…
              </span>
            </div>
            <button className="layout-e__button layout-e__button--primary" disabled>
              Send <kbd>↵</kbd>
            </button>
          </div>
        </div>

        {/* Right column */}
        <div className="layout-e__sidebar">
          <div className="layout-e__sidebar-section">
            <div className="layout-e__sidebar-header">PROJECT TREE</div>
            <div className="layout-e__tree">
              <div className="layout-e__tree-item">
                <span className="layout-e__tree-icon">▸</span>
                <span>/Content</span>
              </div>
              <div className="layout-e__tree-item" style={{ paddingLeft: 12 }}>
                <span className="layout-e__tree-icon">▸</span>
                <span>Blueprints</span>
              </div>
              <div className="layout-e__tree-item layout-e__tree-item--in-scope" style={{ paddingLeft: 24 }}>
                <span className="layout-e__tree-marker" />
                <span className="layout-e__tree-icon">·</span>
                <span>BP_InteractableDoor</span>
                <span className="layout-e__tree-badge">new</span>
              </div>
            </div>
          </div>

          <div className="layout-e__sidebar-section">
            <div className="layout-e__sidebar-header">IN SCOPE · 3</div>
            <div className="layout-e__scope-chips">
              <span className="layout-e__scope-chip">SM_Door_Oak</span>
              <span className="layout-e__scope-chip">/Meshes/Doors</span>
              <span className="layout-e__scope-chip">InteractionRegistry.ini</span>
            </div>
          </div>

          <div className="layout-e__sidebar-section">
            <div className="layout-e__sidebar-header">TOOLS ENABLED · 6</div>
            <div className="layout-e__tools">
              {[
                ['list_assets', 'read'],
                ['read_blueprint', 'read'],
                ['duplicate_asset', 'write'],
                ['reparent_bp', 'write'],
                ['spawn_actor', 'write'],
                ['run_python', 'exec'],
              ].map(([name, cap]) => (
                <div key={name} className="layout-e__tool-row">
                  <span className="layout-e__tool-name">{name}</span>
                  <span className={`layout-e__tool-cap layout-e__tool-cap--${cap}`}>
                    {cap}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom bar */}
      <div className="layout-e__bottombar">
        <div className="layout-e__bottombar-item">
          <BridgeIndicator connected activity={state === 'running' ? 'active' : 'idle'} />
          <span>bridge :8451</span>
        </div>
        <span className="layout-e__bottombar-separator">·</span>
        <span className="layout-e__bottombar-item">Meridian_Prototype</span>
        <span className="layout-e__bottombar-separator">·</span>
        <span className="layout-e__bottombar-item layout-e__bottombar-item--muted">UE 5.7.0</span>
        <div style={{ flex: 1 }} />
        {state === 'running' && (
          <span className="layout-e__bottombar-item layout-e__bottombar-item--muted">
            running step 2 of 5
          </span>
        )}
        <span className="layout-e__bottombar-item layout-e__bottombar-item--muted">sonnet-4.6</span>
      </div>
    </div>
  );
}
