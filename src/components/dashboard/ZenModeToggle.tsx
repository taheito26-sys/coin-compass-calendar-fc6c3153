/**
 * Zen Mode toggle — hides all monetary values, shows only percentages
 */
import { useEffect } from "react";

export function useZenMode(): [boolean, () => void] {
  const key = "lt_zen_mode";
  const isZen = typeof window !== "undefined" && document.documentElement.classList.contains("zen-mode");

  const toggle = () => {
    const on = document.documentElement.classList.toggle("zen-mode");
    localStorage.setItem(key, on ? "1" : "0");
  };

  // Restore on mount
  useEffect(() => {
    if (localStorage.getItem(key) === "1") {
      document.documentElement.classList.add("zen-mode");
    }

    // Keyboard shortcut: Ctrl/Cmd + Shift + Z
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "z") {
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return [isZen, toggle];
}

export default function ZenModeButton() {
  const [isZen, toggle] = useZenMode();

  return (
    <button
      onClick={toggle}
      title="Zen Mode (⌘⇧Z) — hide monetary values"
      style={{
        background: isZen ? "var(--brand)" : "var(--panel2)",
        color: isZen ? "#fff" : "var(--muted)",
        border: "1px solid var(--line)",
        borderRadius: "var(--lt-radius-sm)",
        padding: "4px 10px",
        fontSize: 11,
        fontWeight: 700,
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        gap: 4,
        transition: "all 0.15s",
      }}
    >
      {isZen ? "🧘 Zen" : "👁 Show"}
    </button>
  );
}
