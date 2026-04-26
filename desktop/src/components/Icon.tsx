interface IconProps {
  name: string;
  size?: 16 | 24;
  className?: string;
}

export default function Icon({ name, size = 16, className = "" }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      className={className}
      aria-hidden="true"
    >
      <use href={`/icons.svg#myika-${size}-${name}`} />
    </svg>
  );
}
