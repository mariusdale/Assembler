import type { TuiState, TuiAction } from './types.js';

export const initialState: TuiState = {
  screen: 'home',
  screenHistory: [],
  projectScan: null,
  runPlan: null,
  activeRunId: null,
  error: null,
};

export function tuiReducer(state: TuiState, action: TuiAction): TuiState {
  switch (action.type) {
    case 'navigate':
      return {
        ...state,
        screen: action.screen,
        screenHistory: [...state.screenHistory, state.screen],
        error: null,
      };
    case 'back': {
      const history = [...state.screenHistory];
      const previous = history.pop() ?? 'home';
      return {
        ...state,
        screen: previous,
        screenHistory: history,
        error: null,
      };
    }
    case 'setProjectScan':
      return { ...state, projectScan: action.scan };
    case 'setRunPlan':
      return { ...state, runPlan: action.plan };
    case 'setActiveRunId':
      return { ...state, activeRunId: action.runId };
    case 'setError':
      return { ...state, error: action.error };
    case 'clearError':
      return { ...state, error: null };
  }
}
