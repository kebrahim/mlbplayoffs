export function Section({
  title,
  description,
  children,
  open,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  open?: boolean;
}) {
  return (
    <details
      open={open}
      className="rounded border border-border bg-surface open:bg-surface-2"
    >
      <summary className="cursor-pointer px-5 py-4 font-heading tracking-wide uppercase select-none">
        {title}
      </summary>
      <div className="border-t border-border px-5 py-5">
        {description && <p className="mb-4 text-sm text-ink-muted">{description}</p>}
        {children}
      </div>
    </details>
  );
}
