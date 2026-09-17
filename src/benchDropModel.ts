import type { Formation, Position } from "./types";

export function getCompactDropPositions(formation: Formation): Position[] {
  const lines: Position[][] = [];
  for (const position of [...formation.positions].sort((a, b) => a.y - b.y)) {
    const line = lines.at(-1);
    if (line && position.y - line[0].y <= 8) line.push(position);
    else lines.push([position]);
  }
  return lines.flatMap((line, row) =>
    [...line]
      .sort((a, b) => a.x - b.x)
      .map((position, column) => ({
        ...position,
        x:
          line.length === 1
            ? 50
            : line.length === 2
              ? 30 + column * 40
              : 18 + (column * 64) / (line.length - 1),
        y: lines.length === 1 ? 50 : 14 + (row * 72) / (lines.length - 1),
      })),
  );
}
