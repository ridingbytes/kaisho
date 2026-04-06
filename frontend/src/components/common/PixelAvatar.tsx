interface PixelAvatarProps {
  seed: string;
  size?: number;
  className?: string;
}

function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function generateGrid(hash: number): boolean[] {
  const grid: boolean[] = [];
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 3; col++) {
      const bit = (hash >> (row * 3 + col)) & 1;
      grid[row * 5 + col] = bit === 1;
      grid[row * 5 + (4 - col)] = bit === 1;
    }
    // Center column uses its own bit
    const centerBit = (hash >> (15 + row)) & 1;
    grid[row * 5 + 2] = centerBit === 1;
  }
  return grid;
}

export function PixelAvatar({
  seed,
  size = 32,
  className,
}: PixelAvatarProps) {
  const hash = hashCode(seed);
  const grid = generateGrid(hash);
  const hue = hash % 360;
  const fill = `hsl(${hue}, 65%, 55%)`;
  const cellSize = size / 5;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className={className}
      role="img"
      aria-label={`Avatar for ${seed}`}
    >
      <rect
        width={size}
        height={size}
        rx={size * 0.15}
        fill="hsl(0, 0%, 15%)"
      />
      {grid.map((on, i) => {
        if (!on) return null;
        const row = Math.floor(i / 5);
        const col = i % 5;
        return (
          <rect
            key={i}
            x={col * cellSize}
            y={row * cellSize}
            width={cellSize}
            height={cellSize}
            fill={fill}
          />
        );
      })}
    </svg>
  );
}
