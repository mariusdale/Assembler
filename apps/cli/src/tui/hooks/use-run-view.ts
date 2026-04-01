import type { RunEvent, RunPlan } from '@devassemble/types';

import { deriveExecutionView } from '../run-insights.js';

export function useRunView(runPlan: RunPlan | null, events: RunEvent[]) {
  if (!runPlan) {
    return null;
  }

  return deriveExecutionView(runPlan, events, new Date());
}
