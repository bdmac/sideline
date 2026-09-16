import { createPortal } from "react-dom";

export function PlayerDragPreview({
  name,
  x,
  y,
}: {
  name: string;
  x: number;
  y: number;
}) {
  return createPortal(
    <div
      className="player-drag-preview"
      aria-hidden="true"
      style={{ left: x, top: y }}
    >
      {name}
    </div>,
    document.body,
  );
}
