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
        "flex items-center gap-1 min-w-0",
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
      style={{ transition: "none" }}
      className={cn(
        "relative inline-flex items-center gap-2 px-4 py-3 text-[length:var(--font-sm)] font-medium",
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
          "absolute left-0 right-0 -bottom-px h-[2px]",
          selected ? "bg-brand" : "bg-transparent"
        )}
      />
    </button>
  );
}

interface TabPanelProps {
  value: string;
  children: ReactNode;
  className?: string;
  keepMounted?: boolean;
}

export function TabPanel({ value, children, className, keepMounted = false }: TabPanelProps) {
  const { value: active, baseId } = useTabs();
  if (active !== value && !keepMounted) return null;
  return (
    <div
      role="tabpanel"
      hidden={active !== value}
      id={`${baseId}-panel-${value}`}
      aria-labelledby={`${baseId}-tab-${value}`}
      className={className}
    >
      {children}
    </div>
  );
}
