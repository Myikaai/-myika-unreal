/*
 * Permission Modal
 *
 * The signature trust moment. When Myika wants to run a tool, this appears.
 *
 * Motion:
 * - Entry: 200ms ease-out with 4px y-translation
 * - Backdrop blur fades in over same duration
 * - Exit: reverse of entry
 * - No bounce, no spring — this is a professional tool
 */

import './PermissionModal.css';
import { IconExecute } from './Icons';

interface PermissionModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function PermissionModal({ isOpen, onClose }: PermissionModalProps) {
  if (!isOpen) return null;

  return (
    <div className="permission-modal-backdrop" onClick={onClose}>
      <div className="permission-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="permission-modal__header">
          <div className="permission-modal__icon">
            <IconExecute size={14} />
          </div>
          <h2 className="permission-modal__title">Myika wants to run a tool</h2>
        </div>

        {/* Content */}
        <div className="permission-modal__content">
          <div className="permission-modal__section">
            <div className="permission-modal__label">TOOL</div>
            <div className="permission-modal__tool">
              <span className="permission-modal__tool-dot" />
              <span className="permission-modal__tool-name">run_python</span>
              <span className="permission-modal__tool-badge">exec</span>
            </div>
          </div>

          <div className="permission-modal__section">
            <div className="permission-modal__label">ARGUMENTS</div>
            <pre className="permission-modal__args">{`script: timeline_scaffold.py
target: BP_InteractableDoor
duration: 1.0s`}</pre>
          </div>

          <div className="permission-modal__note">
            Will generate a <code>.uasset</code> Timeline and attach it to{' '}
            <code>BP_InteractableDoor</code>. Reversible via git checkpoint.
          </div>
        </div>

        {/* Actions */}
        <div className="permission-modal__actions">
          <button className="permission-modal__button permission-modal__button--primary">
            Allow once
          </button>
          <button className="permission-modal__button permission-modal__button--secondary">
            Always allow
          </button>
          <button className="permission-modal__button permission-modal__button--danger">
            Deny
          </button>
        </div>

        {/* Footer hints */}
        <div className="permission-modal__footer">
          <span><kbd>⌘</kbd><kbd>↵</kbd> allow</span>
          <span><kbd>⌘</kbd><kbd>⇧</kbd><kbd>↵</kbd> always</span>
          <span><kbd>esc</kbd> deny</span>
        </div>
      </div>
    </div>
  );
}
