import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useTabs, type Tab } from "../stores/tabs";

interface Props {
  tab: Tab;
  /** The automatic name, shown while editing and kept if left unchanged. */
  autoLabel: string;
  className?: string;
  style?: CSSProperties;
}

/** Inline editor for a tab's name: ⏎ saves, Esc cancels, empty = automatic. */
export function RenameInput({ tab, autoLabel, className, style }: Props) {
  const [value, setValue] = useState(tab.customName ?? autoLabel);
  const ref = useRef<HTMLInputElement>(null);
  const done = useRef(false);

  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  const commit = () => {
    if (done.current) return;
    done.current = true;
    const { renameTab, setRenaming } = useTabs.getState();
    // Leaving the automatic name untouched keeps it automatic.
    if (!tab.customName && value.trim() === autoLabel) setRenaming(null);
    else renameTab(tab.id, value);
  };

  const cancel = () => {
    done.current = true;
    useTabs.getState().setRenaming(null);
  };

  return (
    <input
      ref={ref}
      value={value}
      spellCheck={false}
      placeholder={autoLabel}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") {
          e.preventDefault();
          commit();
        } else if (e.key === "Escape") {
          e.preventDefault();
          cancel();
        }
      }}
      onBlur={commit}
      // Clicking inside the box shouldn't start a drag or switch tabs.
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      className={[
        "min-w-0 rounded border border-[var(--nova-accent)] bg-[var(--nova-bg)] px-1 text-[var(--nova-text)] outline-none",
        className ?? "",
      ].join(" ")}
      style={style}
    />
  );
}
