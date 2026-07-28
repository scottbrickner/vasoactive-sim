import { useEffect, useState } from 'react'
import { Button, Panel } from '../design/primitives'
import type { AttemptRecord } from '../engine/skillAttempt'
import {
  attemptFiles,
  exportAttemptCSV,
  exportAttemptJSON,
} from '../sync/skillAttemptExport'
import {
  getSavedFolder,
  isFolderSaveSupported,
  pickTeamsFolder,
  readFileFromFolder,
  writeFileToFolder,
  type MinimalDirectoryHandle,
} from '../sync/teamsFolder'

type FolderState =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'need-picker' }
  | { status: 'saving' }
  | { status: 'saved'; folderName: string; trackingOk: boolean }
  | { status: 'error' }

/**
 * Reads the shared tracking workbook from the folder (if any), appends a row for this
 * attempt, and writes it back. Deliberately isolated in its own try/catch, called only
 * after the individual JSON/CSV writes succeed — a workbook-write failure (e.g. the
 * file is open/locked in Excel desktop) must never block or fail the individual
 * record's own save, and must never be silently swallowed either (see the trackingOk-
 * driven status copy below). No real backend, no atomic append across computers — see
 * skillTrackingWorkbook.ts's doc comment for the accepted concurrent-write risk.
 *
 * Dynamically imports skillTrackingWorkbook.ts (and its xlsx dependency, ~250KB
 * gzipped) rather than a top-level import — that library has no business being in
 * every learner's initial page-load bundle when most visits never reach this code
 * path at all (File System Access support + an actual save attempt). Vite code-splits
 * it into its own chunk, fetched only the first time this function actually runs.
 */
async function saveAttemptToTrackingWorkbook(handle: MinimalDirectoryHandle, record: AttemptRecord): Promise<boolean> {
  try {
    const { appendAttemptRow, SKILL_TRACKING_WORKBOOK_FILENAME } = await import('../sync/skillTrackingWorkbook')
    const existing = await readFileFromFolder(handle, SKILL_TRACKING_WORKBOOK_FILENAME)
    const updated = appendAttemptRow(existing, record)
    await writeFileToFolder(handle, SKILL_TRACKING_WORKBOOK_FILENAME, updated)
    return true
  } catch {
    return false
  }
}

/**
 * Simplified port of zoll-r-series-simulator's SignoffPanel.jsx — no evaluator
 * name/email/title fields, no human-override step: there's no facilitator/evaluator
 * role gating debrief in vasoactive-sim the way ZOLL's SME does, and the pass/fail
 * here is fully automatic from the scorecard (see engine/scoring.ts's isSkillPassed).
 * If the institution ever wants a proctor able to contest an automatic result,
 * ProctorRecord (state/types.ts) already exists as the natural anchor for that later.
 *
 * On mount, silently auto-saves JSON+CSV into a previously-picked local folder if
 * permission is still granted (Chrome/Edge only) — otherwise offers a one-time folder
 * picker. Every browser also gets plain JSON/CSV download buttons regardless.
 */
export function SkillAttemptPanel({ record }: { record: AttemptRecord | null }) {
  const [folderState, setFolderState] = useState<FolderState>({ status: 'idle' })

  useEffect(() => {
    if (!record || !isFolderSaveSupported()) return
    let cancelled = false
    ;(async () => {
      setFolderState({ status: 'checking' })
      const handle = await getSavedFolder().catch(() => null)
      if (cancelled) return
      if (!handle) {
        setFolderState({ status: 'need-picker' })
        return
      }
      try {
        const files = attemptFiles(record)
        await writeFileToFolder(handle, files.json.name, files.json.contents)
        await writeFileToFolder(handle, files.csv.name, files.csv.contents)
        if (cancelled) return
        const trackingOk = await saveAttemptToTrackingWorkbook(handle, record)
        if (!cancelled) setFolderState({ status: 'saved', folderName: handle.name, trackingOk })
      } catch {
        if (!cancelled) setFolderState({ status: 'error' })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [record])

  if (!record) return null

  const chooseFolder = async () => {
    setFolderState({ status: 'saving' })
    try {
      const handle = await pickTeamsFolder()
      const files = attemptFiles(record)
      await writeFileToFolder(handle, files.json.name, files.json.contents)
      await writeFileToFolder(handle, files.csv.name, files.csv.contents)
      const trackingOk = await saveAttemptToTrackingWorkbook(handle, record)
      setFolderState({ status: 'saved', folderName: handle.name, trackingOk })
    } catch (err) {
      const isAbort = (err as { name?: string } | null)?.name === 'AbortError'
      setFolderState({ status: isAbort ? 'need-picker' : 'error' })
    }
  }

  return (
    <Panel title="Save this attempt">
      {isFolderSaveSupported() ? (
        <div className="flex flex-col gap-3">
          {(folderState.status === 'checking' || folderState.status === 'saving') && (
            <p className="text-sm text-muted">Saving to the Teams folder…</p>
          )}
          {folderState.status === 'saved' && (
            <p className="text-sm text-ink">
              Saved to the "{folderState.folderName}" folder
              {folderState.trackingOk
                ? ' and added to the tracking sheet.'
                : ' — the tracking sheet could not be updated (it may be open in Excel). Your individual record is safely saved.'}
            </p>
          )}
          {(folderState.status === 'need-picker' || folderState.status === 'error') && (
            <Button onClick={chooseFolder}>
              {folderState.status === 'error' ? "Couldn't save — retry" : 'Save to Teams folder'}
            </Button>
          )}
          <div className="flex flex-wrap gap-2">
            {folderState.status === 'saved' && (
              <Button variant="ghost" onClick={chooseFolder}>
                Change folder
              </Button>
            )}
            <Button variant="ghost" onClick={() => exportAttemptJSON(record)}>
              Download JSON instead
            </Button>
            <Button variant="ghost" onClick={() => exportAttemptCSV(record)}>
              Download CSV instead
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => exportAttemptJSON(record)}>Download record (JSON)</Button>
          <Button variant="secondary" onClick={() => exportAttemptCSV(record)}>
            Download record (CSV)
          </Button>
        </div>
      )}
    </Panel>
  )
}
