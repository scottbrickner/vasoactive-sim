import { AppShell } from './app/AppShell'
import { ScenarioIntro } from './app/screens/ScenarioIntro'
import { Simulation } from './app/screens/Simulation'
import { Debrief } from './app/screens/Debrief'
import { useShellStore } from './state/store'

/** Top-level router: a simple phase switch (intro → sim → debrief) driven by the shell store. */
export default function App() {
  const phase = useShellStore((s) => s.phase)
  return (
    <AppShell>
      {phase === 'intro' && <ScenarioIntro />}
      {phase === 'sim' && <Simulation />}
      {phase === 'debrief' && <Debrief />}
    </AppShell>
  )
}
