import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from '../App'
import { useSimStore } from '../state/store'
import { useSkillTrackingStore } from '../state/skillTrackingStore'
import { DEFAULT_SCENARIO } from '../data/scenarios'

afterEach(() => {
  cleanup()
  // Reset the sim store between tests so each test starts from a clean 'intro' state.
  useSimStore.getState().startScenario(DEFAULT_SCENARIO, 'training')
  useSimStore.setState({ phase: 'intro' })
  // Phase 15: the skill-tracking store is separate from useSimStore and persists to
  // localStorage — reset both so learner identity doesn't leak across tests/files.
  localStorage.clear()
  useSkillTrackingStore.setState({ learnerIdentity: null, skillAttempts: [] })
})

describe('app shell', () => {
  it('renders the branded header with sim clock, MAP, and target readouts', () => {
    render(<App />)
    const header = screen.getByRole('banner')
    expect(within(header).getByText('Vasoactive Titration Simulator')).toBeInTheDocument()

    const status = within(header).getByLabelText('Simulation status')
    expect(within(status).getByText('Sim time')).toBeInTheDocument()
    expect(within(status).getByText('00:00')).toBeInTheDocument()
    expect(within(status).getByText('Current MAP')).toBeInTheDocument()
    expect(within(status).getByText('Target MAP')).toBeInTheDocument()
    // Both blank before the sim starts — the intro screen hasn't picked (and may
    // randomize away from) the last-loaded scenario, so showing its stale target would
    // misrepresent the upcoming one (see Header.tsx).
    expect(within(status).getAllByText('—')).toHaveLength(2)
  })

  it('starts on the Scenario Intro screen', () => {
    render(<App />)
    expect(screen.getByRole('heading', { name: 'Welcome to the simulation' })).toBeInTheDocument()
  })

  it('advances intro → sim → debrief → intro via the phase buttons', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Begin simulation' }))
    expect(screen.getByRole('heading', { name: 'Bedside workspace' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /End .* go to debrief/ }))
    // ScenarioIntro picks randomly; a scenario with pre-seeded infusions (nothing charted
    // yet) triggers the soft pre-end warning (Phase 12d) — confirm through it if present.
    const confirmButton = screen.queryByRole('button', { name: /Submit for grading|Confirm and continue/ })
    if (confirmButton) await user.click(confirmButton)
    expect(screen.getByRole('heading', { name: "Nice work — let's review" })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Restart simulation' }))
    expect(screen.getByRole('heading', { name: 'Welcome to the simulation' })).toBeInTheDocument()
  })

  it('gates "Begin simulation" on a valid learner identity only in Validation mode (Phase 15)', async () => {
    const user = userEvent.setup()
    render(<App />)

    // Training mode (the default): no identity required, zero new friction.
    expect(screen.getByRole('button', { name: 'Begin simulation' })).toBeEnabled()

    await user.click(screen.getByRole('button', { name: /^Validation/ }))
    expect(screen.getByRole('button', { name: 'Begin simulation' })).toBeDisabled()

    await user.type(screen.getByLabelText('Name'), 'Jane Doe')
    await user.type(screen.getByLabelText('Institutional email'), 'jane.doe@gmail.com')
    expect(screen.getByRole('button', { name: 'Begin simulation' })).toBeDisabled()
    expect(screen.getByText(/Must be an institutional email/)).toBeInTheDocument()

    await user.clear(screen.getByLabelText('Institutional email'))
    await user.type(screen.getByLabelText('Institutional email'), 'jane.doe@med.usc.edu')
    expect(screen.getByRole('button', { name: 'Begin simulation' })).toBeEnabled()
  })
})
