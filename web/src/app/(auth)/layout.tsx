export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-bg flex items-center justify-center p-4 relative overflow-hidden">
      {/* decorative background */}
      <div
        aria-hidden
        className="absolute inset-0 grid-bg opacity-60 pointer-events-none"
      />
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(circle at 50% 0%, var(--brand-soft), transparent 55%)",
        }}
      />
      <div className="relative z-10 w-full max-w-md">{children}</div>
    </main>
  );
}
