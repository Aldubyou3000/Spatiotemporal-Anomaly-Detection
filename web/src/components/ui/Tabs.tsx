"use client";

import React, { createContext, ReactNode, useContext, useId, useState } from "react";
import { cn } from "@/lib/cn";

interface TabsContextValue {
  value: string;
  setValue: (next: string) => void;
  baseId: string;
}

const TabsContext = createContext<TabsContextValue | null>(null);

function useTabs(): TabsContextValue {
  const ctx = useContext(TabsContext);
  if (!ctx) throw new Error("Tabs subcomponents must be used inside <Tabs>");
  return ctx;
}

interface TabsProps {
  defaultValue: string;
  value?: string;
  onValueChange?: (next: string) => void;
  children: ReactNode;
  className?: string;
}

export function Tabs({ defaultValue, value: controlled, onValueChange, children, className }: TabsProps) {
  const [internal, setInternal] = useState(defaultValue);
  const value = controlled ?? internal;
  const baseId = useId();

  const setValue = (next: string) => {
    if (!controlled) setInternal(next);
    onValueChange?.(next);
  };

  return (
    <TabsContext.Provider value={{ value, setValue, baseId }}>
      <div className={className}>{children}</div>
    </TabsContext.Provider>
  );
}

export function TabsList({ children, className, style }: { children: ReactNode; className?: string; style?: React.CSSProperties }) {
  return (
    <div
      role="tablist"
      className={cn(
        "flex items-center gap-1 border-b border-border min-w-0",
        className
      )}
      style={style}
    >
      {children}
    </div>
  );
}

interface TabProps {
  value: string;
  children: ReactNode;
  icon?: ReactNode;
  className?: string;
}

export function Tab({ value, children, icon, className }: TabProps) {
  const { value: active, setValue, baseId } = useTabs();
  const selected = active === value;

  return (
    <button
      role="tab"
      aria-selected={selected}
      aria-controls={`${baseId}-panel-${value}`}
      id={`${baseId}-tab-${value}`}
      onClick={() => setValue(value)}
      className={cn(
        "relative inline-flex items-center gap-2 px-4 py-3 text-[13px] font-medium",
        "transition-colors duration-150",
        "whitespace-nowrap shrink-0",
        selected
          ? "text-text"
          : "text-text-secondary hover:text-text",
        className
      )}
    >
      {icon}
      {children}
      <span
        className={cn(
          "absolute left-0 right-0 -bottom-px h-[2px] origin-center transition-transform duration-200",
          selected ? "bg-brand scale-x-100" : "bg-transparent scale-x-0"
        )}
      />
    </button>
  );
}

interface TabPanelProps {
  value: string;
  children: ReactNode;
  className?: string;
}

export function TabPanel({ value, children, className }: TabPanelProps) {
  const { value: active, baseId } = useTabs();
  if (active !== value) return null;
  return (
    <div
      role="tabpanel"
      id={`${baseId}-panel-${value}`}
      aria-labelledby={`${baseId}-tab-${value}`}
      className={cn("animate-fade-in-up", className)}
    >
      {children}
    </div>
  );
}
