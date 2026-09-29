import { useRef, useState } from "react";
import { Icon } from "./Icon";
export type Corner = "top-left" | "top-right" | "bottom-left" | "bottom-right";
export function CornerHandle({
  name,
  corner,
  onCorner,
}: {
  name: string;
  corner: Corner;
  onCorner: (corner: Corner) => void;
}) {
  const [dragging, setDragging] = useState(false);
  const bounds = useRef<DOMRect | null>(null);
  const start = useRef<[number, number] | null>(null);
  return (
    <button
      className="panel-drag-handle"
      data-dragging={dragging}
      aria-label={`Move ${name} panel`}
      title="Drag to a corner · arrow keys to reposition"
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        bounds.current = e.currentTarget
          .closest(".visualization-stage")!
          .getBoundingClientRect();
        start.current = [e.clientX, e.clientY];
        e.currentTarget.setPointerCapture(e.pointerId);
        setDragging(true);
      }}
      onPointerMove={(e) => {
        if (
          !start.current ||
          !bounds.current ||
          Math.hypot(
            e.clientX - start.current[0],
            e.clientY - start.current[1],
          ) < 8
        )
          return;
        const b = bounds.current;
        onCorner(
          `${e.clientY < b.y + b.height / 2 ? "top" : "bottom"}-${e.clientX < b.x + b.width / 2 ? "left" : "right"}`,
        );
      }}
      onPointerUp={(e) => {
        start.current = null;
        setDragging(false);
        e.currentTarget.releasePointerCapture(e.pointerId);
      }}
      onLostPointerCapture={() => {
        start.current = null;
        setDragging(false);
      }}
      onPointerCancel={() => {
        start.current = null;
        setDragging(false);
      }}
      onKeyDown={(e) => {
        if (!e.key.startsWith("Arrow")) return;
        e.preventDefault();
        const [vertical, horizontal] = corner.split("-");
        onCorner(
          `${e.key === "ArrowUp" ? "top" : e.key === "ArrowDown" ? "bottom" : vertical}-${e.key === "ArrowLeft" ? "left" : e.key === "ArrowRight" ? "right" : horizontal}` as Corner,
        );
      }}
    >
      <Icon name="move" size={17} />
    </button>
  );
}
