import type { ProjectScan, RunPlan } from '@devassemble/types';

export type ScreenName =
  | 'home'
  | 'launch'
  | 'plan'
  | 'status'
  | 'setup'
  | 'teardown'
  | 'env'
  | 'preview'
  | 'domain'
  | 'creds'
  | 'doctor'
  | 'help';

export interface TuiState {
  screen: ScreenName;
  screenHistory: ScreenName[];
  projectScan: ProjectScan | null;
  runPlan: RunPlan | null;
  activeRunId: string | null;
  error: { message: string; remediation?: string } | null;
}

export type TuiAction =
  | { type: 'navigate'; screen: ScreenName }
  | { type: 'back' }
  | { type: 'setProjectScan'; scan: ProjectScan }
  | { type: 'setRunPlan'; plan: RunPlan }
  | { type: 'setActiveRunId'; runId: string | null }
  | { type: 'setError'; error: { message: string; remediation?: string } | null }
  | { type: 'clearError' };
