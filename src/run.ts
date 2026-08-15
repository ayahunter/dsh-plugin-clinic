/**
 * Shared runner contract: one closure executes a diagnosis at a severity
 * threshold. Both the model tool and the HTTP routes consume it, so a single
 * collection+assembly pipeline serves all delivery surfaces.
 * @module dsh-plugin-clinic/run
 */

import type { ClinicReport, Severity } from './types.ts'

/** Executes one diagnosis run at the given severity threshold. */
export interface RunClinic {
  run(severity: Severity): Promise<ClinicReport>
}
