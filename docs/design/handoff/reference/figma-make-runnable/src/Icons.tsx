/*
 * Custom Icons — Myika Unreal Reference
 *
 * 16×16 pixel icons, 2px stroke, slightly rounded caps.
 * Designed to feel custom and branded, not generic.
 *
 * Philosophy: Stark and minimal, Phosphor/Lucide quality.
 * Each icon is semantically tied to its capability.
 */

interface IconProps extends React.SVGProps<SVGSVGElement> {
  size?: number;
}

export function IconRead({ size = 16, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      {/* Eye — reading/observing */}
      <path d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5z" />
      <circle cx="8" cy="8" r="2" />
    </svg>
  );
}

export function IconWrite({ size = 16, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      {/* Pen — writing/modifying */}
      <path d="M11 2L14 5 6 13H3v-3L11 2z" />
    </svg>
  );
}

export function IconExecute({ size = 16, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      {/* Lightning bolt — execution/power */}
      <path d="M9 2L3 9h5l-1 5 6-7H8l1-5z" />
    </svg>
  );
}

export function IconSearch({ size = 16, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      {/* Magnifying glass */}
      <circle cx="7" cy="7" r="4.5" />
      <path d="M10.5 10.5L14 14" />
    </svg>
  );
}

export function IconAsset({ size = 16, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      {/* Box/package — asset file */}
      <path d="M2 4L8 1l6 3v8l-6 3-6-3V4z" />
      <path d="M2 4l6 3m0 0l6-3m-6 3v8" />
    </svg>
  );
}

export function IconCode({ size = 16, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      {/* Code brackets */}
      <path d="M5 3L1 8l4 5M11 3l4 5-4 5" />
    </svg>
  );
}
