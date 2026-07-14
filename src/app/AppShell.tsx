import type { ReactNode } from 'react'
import { Header } from './Header'

/** Frame for the friendly branded shell: persistent header + centered main content region. */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <Header />
      <main className="mx-auto w-full max-w-6xl flex-1 px-gutter py-section">{children}</main>
      <footer className="border-t border-border bg-surface">
        <div className="mx-auto max-w-6xl px-gutter py-3 text-xs text-muted">
          Training simulation · not for clinical use. Institutional policy (CP 4-156) governs.
        </div>
      </footer>
    </div>
  )
}
