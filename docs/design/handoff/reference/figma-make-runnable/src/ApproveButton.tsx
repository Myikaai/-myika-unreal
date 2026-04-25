/*
 * Approve & Run Button
 *
 * The most important button in the app. Deserves special treatment.
 *
 * At rest: Directional glow on BOTTOM edge only (not all around)
 * On hover: Glow intensifies
 * On press: Slight scale down
 *
 * Philosophy: Feels pressable and physical. The bottom glow suggests
 * real light hitting the bottom edge of a raised surface.
 */

import './ApproveButton.css';

interface ApproveButtonProps {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}

export function ApproveButton({ children, onClick, disabled }: ApproveButtonProps) {
  return (
    <button
      className="approve-button"
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}
