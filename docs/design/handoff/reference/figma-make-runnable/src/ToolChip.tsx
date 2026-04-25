/*
 * Tool Call Chip
 *
 * Inline chips that appear in the chat stream to show tool executions.
 *
 * States:
 * - done: Green dot, static
 * - running: Yellow dot + scanline animation + bottom progress bar
 * - error: Red dot, static
 *
 * Running state signature:
 * - Barely-visible horizontal scanline sweeps across (4-8% white)
 * - 1px accent-colored progress bar animates along bottom edge
 * - Conveys "something is happening" without being loud
 */

import './ToolChip.css';
import { IconRead, IconWrite, IconExecute } from './Icons';

interface ToolChipProps {
  name: string;
  status?: 'done' | 'running' | 'error';
  capability?: 'read' | 'write' | 'exec';
}

const capabilityIcons = {
  read: IconRead,
  write: IconWrite,
  exec: IconExecute,
};

export function ToolChip({ name, status = 'done', capability }: ToolChipProps) {
  const Icon = capability ? capabilityIcons[capability] : null;

  return (
    <span className={`tool-chip tool-chip--${status}`}>
      {/* Status indicator dot */}
      <span className="tool-chip__dot" />

      {/* Tool name */}
      <span className="tool-chip__name">{name}</span>

      {/* Capability icon */}
      {Icon && (
        <Icon size={12} className="tool-chip__icon" />
      )}

      {/* Running state animations */}
      {status === 'running' && (
        <>
          <div className="tool-chip__scanline" />
          <div className="tool-chip__progress" />
        </>
      )}
    </span>
  );
}
