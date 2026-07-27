/**
 * Institutional-email validator — used for both the (non-authenticating) learner-
 * identity field captured before a validation-mode run (Phase 15) and the proctor
 * email field in the facilitator launcher (Phase 10d). A plausibility check on a
 * free-typed field, not a security control.
 */
export function isValidInstitutionalEmail(email: string): boolean {
  return /^[^\s@]+@med\.usc\.edu$/i.test(email.trim())
}
