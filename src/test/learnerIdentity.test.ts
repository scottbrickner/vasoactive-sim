import { describe, expect, it } from 'vitest'
import { isValidInstitutionalEmail } from '../lib/learnerIdentity'

describe('isValidInstitutionalEmail', () => {
  it('accepts a plausible institutional email', () => {
    expect(isValidInstitutionalEmail('jane.doe@med.usc.edu')).toBe(true)
  })

  it('is case-insensitive on the domain', () => {
    expect(isValidInstitutionalEmail('jane.doe@MED.USC.EDU')).toBe(true)
  })

  it('tolerates leading/trailing whitespace', () => {
    expect(isValidInstitutionalEmail('  jane.doe@med.usc.edu  ')).toBe(true)
  })

  it('rejects a non-institutional domain', () => {
    expect(isValidInstitutionalEmail('jane.doe@gmail.com')).toBe(false)
  })

  it('rejects a malformed address', () => {
    expect(isValidInstitutionalEmail('not-an-email')).toBe(false)
  })

  it('rejects an empty string', () => {
    expect(isValidInstitutionalEmail('')).toBe(false)
  })
})
