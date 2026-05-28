import { HTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/cn";

export const Card = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(function Card(
  { className, style, ...rest },
  ref
) {
  return (
    <div
      ref={ref}
      className={cn(className)}
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--r-xl)",
        boxShadow: "var(--shadow-xs)",
        overflow: "hidden",
        ...style,
      }}
      {...rest}
    />
  );
});

export function CardHeader({ className, style, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(className)}
      style={{
        padding: "14px 20px",
        borderBottom: "1px solid var(--divider)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        ...style,
      }}
      {...rest}
    />
  );
}

export function CardTitle({ className, style, ...rest }: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={cn(className)}
      style={{
        margin: 0,
        fontSize: "var(--font-sm)",
        fontWeight: 600,
        letterSpacing: "-0.005em",
        color: "var(--text)",
        ...style,
      }}
      {...rest}
    />
  );
}

export function CardDescription({ className, style, ...rest }: HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      className={cn(className)}
      style={{ margin: 0, fontSize: "var(--font-sm)", color: "var(--text-muted)", ...style }}
      {...rest}
    />
  );
}

export function CardBody({ className, style, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(className)}
      style={{ padding: "16px 20px", ...style }}
      {...rest}
    />
  );
}

export function CardFooter({ className, style, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(className)}
      style={{
        padding: "12px 20px",
        borderTop: "1px solid var(--divider)",
        ...style,
      }}
      {...rest}
    />
  );
}
