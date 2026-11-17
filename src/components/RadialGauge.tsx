interface RadialGaugeProps {
  value: number;
  size?: number;
}

export function RadialGauge({ value, size = 40 }: RadialGaugeProps) {
  const radius = size / 2 - 4;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.min(Math.max(value, 0), 100);
  const colorClass =
    clamped >= 50
      ? 'text-success'
      : clamped >= 20
        ? 'text-warning'
        : 'text-destructive';

  return (
    <svg
      width={size}
      height={size}
      className={`shrink-0 ${colorClass}`}
      aria-label={`${Math.round(value)}%`}
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        strokeWidth={3.5}
        className="stroke-muted"
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        strokeWidth={3.5}
        stroke="currentColor"
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - clamped / 100)}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text
        x="50%"
        y="53%"
        textAnchor="middle"
        dominantBaseline="middle"
        className="fill-foreground font-mono tabular-nums"
        fontSize={size / 4.1}
      >
        {Math.round(value)}%
      </text>
    </svg>
  );
}
