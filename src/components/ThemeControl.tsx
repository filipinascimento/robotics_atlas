import { useEffect, useRef, useState } from "react";
import { useTheme } from "../theme";
import type { ThemePreference } from "../theme";
import { Icon } from "./Icon";
const choices: { value: ThemePreference; label: string; icon: string }[] = [
  { value: "system", label: "Automatic", icon: "monitor" },
  { value: "light", label: "Light", icon: "sun" },
  { value: "dark", label: "Dark", icon: "moon" },
];
export function ThemeControl() {
  const { mode, preference, setPreference } = useTheme();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    root.current
      ?.querySelector<HTMLButtonElement>('[aria-checked="true"]')
      ?.focus();
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);
  return (
    <div
      className="theme-control"
      ref={root}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          setOpen(false);
          trigger.current?.focus();
        }
        if (open && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
          event.preventDefault();
          const items = Array.from(
            root.current!.querySelectorAll<HTMLButtonElement>(
              '[role="menuitemradio"]',
            ),
          );
          const index = items.indexOf(
            document.activeElement as HTMLButtonElement,
          );
          items[
            (index + (event.key === "ArrowDown" ? 1 : items.length - 1)) %
              items.length
          ]?.focus();
        }
      }}
    >
      <button
        ref={trigger}
        className="theme-toggle"
        aria-label="Change theme"
        title={`Theme: ${preference === "system" ? `Automatic (${mode})` : preference}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <Icon
          name={
            preference === "system"
              ? "monitor"
              : mode === "light"
                ? "sun"
                : "moon"
          }
          size={17}
        />
      </button>
      {open && (
        <div className="theme-menu" role="menu" aria-label="Appearance">
          {choices.map((choice) => (
            <button
              key={choice.value}
              role="menuitemradio"
              aria-checked={preference === choice.value}
              onClick={() => {
                setPreference(choice.value);
                setOpen(false);
                trigger.current?.focus();
              }}
            >
              <Icon name={choice.icon} size={16} /> {choice.label}
              {preference === choice.value && (
                <span className="theme-check">✓</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
