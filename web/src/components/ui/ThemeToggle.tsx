"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/context/ThemeContext";
import { cn } from "@/lib/cn";

interface ThemeToggleProps {
  className?: string;
}

export function ThemeToggle({ className }: ThemeToggleProps) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isDark}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      onClick={toggleTheme}
      className={cn(
        "relative h-8 w-14 rounded-full border border-border-strong",
        "bg-surface-alt transition-[background-color,border-color] duration-180 ease-in-out",
        "hover:border-brand/40",
        "focus:outline-none focus:ring-4 focus:ring-brand-soft",
        className
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 left-0.5 grid place-items-center",
          "h-[26px] w-[26px] rounded-full bg-surface shadow-sm",
          "transition-transform duration-200 ease-out",
          isDark && "translate-x-6"
        )}
        style={{ boxShadow: "var(--shadow-sm)" }}
      >
        {isDark ? (
          <Moon size={13} className="text-brand" strokeWidth={2.2} />
        ) : (
          <Sun size={13} className="text-warning" strokeWidth={2.2} />
        )}
      </span>
    </button>
  );
}
