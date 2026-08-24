"use client";

import { useEffect, useRef, useState } from "react";

type Option = { value: string; label: string };

type CustomSelectProps = {
  value?: string;
  onChange?: (value: string) => void;
  defaultValue?: string;
  name?: string;
  options: Option[];
  disabled?: boolean;
  placeholder?: string;
  className?: string;
};

/**
 * Native <select> popups can't be restyled cross-browser (Safari/Firefox
 * lock that panel to OS chrome). This is a themed drop-in replacement.
 * Pass value+onChange for controlled use, or defaultValue+name to behave
 * like a native field inside a form submitted via FormData.
 */
export default function CustomSelect({ value, onChange, defaultValue, name, options, disabled, placeholder, className }: CustomSelectProps) {
  const isControlled = value !== undefined;
  const [internalValue, setInternalValue] = useState(defaultValue ?? options[0]?.value ?? "");
  const currentValue = isControlled ? value : internalValue;

  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const selected = options.find((option) => option.value === currentValue);

  useEffect(() => {
    if (!open) return;

    function close() {
      setOpen(false);
    }

    function handleClickOutside(event: MouseEvent) {
      if (buttonRef.current?.contains(event.target as Node)) return;
      if (listRef.current?.contains(event.target as Node)) return;
      close();
    }

    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") close();
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKey);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKey);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  function toggleOpen() {
    if (disabled) return;
    if (!open && buttonRef.current) {
      const box = buttonRef.current.getBoundingClientRect();
      setRect({ top: box.bottom + 4, left: box.left, width: box.width });
    }
    setOpen((current) => !current);
  }

  function selectOption(next: string) {
    if (!isControlled) setInternalValue(next);
    onChange?.(next);
    setOpen(false);
  }

  return (
    <div className={`custom-select${className ? ` ${className}` : ""}`}>
      {name ? <input type="hidden" name={name} value={currentValue} /> : null}
      <button
        type="button"
        ref={buttonRef}
        className={`custom-select-trigger${open ? " open" : ""}`}
        onClick={toggleOpen}
        disabled={disabled}
      >
        <span>{selected?.label || placeholder || ""}</span>
      </button>
      {open && rect ? (
        <div ref={listRef} className="custom-select-list" role="listbox" style={{ top: rect.top, left: rect.left, width: rect.width }}>
          {options.map((option) => (
            <button
              type="button"
              key={option.value}
              role="option"
              aria-selected={option.value === currentValue}
              className={`custom-select-option${option.value === currentValue ? " selected" : ""}`}
              onClick={() => selectOption(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
