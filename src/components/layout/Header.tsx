interface HeaderProps {
  title?: string
}

export function Header({ title }: HeaderProps) {
  return (
    <header className="flex h-14 items-center justify-between border-b border-border bg-card px-6">
      <div className="text-sm text-muted-foreground">
        {title && <span className="text-foreground">{title}</span>}
      </div>
      <div className="flex items-center gap-4">
        <span className="text-xs text-muted-foreground">Hermes Agent v0.8.0</span>
      </div>
    </header>
  )
}
