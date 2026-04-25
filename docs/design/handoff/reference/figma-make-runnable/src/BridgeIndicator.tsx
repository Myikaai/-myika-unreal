/*
 * Bridge Connection Indicator — The signature element
 *
 * This is the heartbeat of the app. Not just a green dot.
 *
 * States:
 * - Connected (idle): Slow steady pulse (2000ms)
 * - Connected (active): Faster pulse (1000ms)
 * - Disconnected: Solid red, no pulse
 *
 * Motion:
 * - The pulse expands from the core dot to an outer ring
 * - Opacity fades from 0.4 → 0 as it expands
 * - Scale grows from 1 → 1.6
 * - Continuous loop with cubic-bezier easing for natural breathing
 */

import './BridgeIndicator.css';

interface BridgeIndicatorProps {
  connected: boolean;
  activity?: 'idle' | 'active';
}

export function BridgeIndicator({ connected, activity = 'idle' }: BridgeIndicatorProps) {
  const statusClass = connected
    ? activity === 'active'
      ? 'bridge-indicator--active'
      : 'bridge-indicator--idle'
    : 'bridge-indicator--disconnected';

  return (
    <div className={`bridge-indicator ${statusClass}`}>
      {/* Core dot */}
      <div className="bridge-indicator__core" />

      {/* Breathing ring — only visible when connected */}
      {connected && (
        <div className="bridge-indicator__ring" />
      )}
    </div>
  );
}
