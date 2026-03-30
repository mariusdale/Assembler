import { useCallback } from 'react';
import { useInput } from 'ink';
import type { TuiAction, ScreenName } from '../types.js';

export function useNavigation(
  dispatch: React.Dispatch<TuiAction>,
  options?: { disabled?: boolean },
) {
  const navigate = useCallback(
    (screen: ScreenName) => dispatch({ type: 'navigate', screen }),
    [dispatch],
  );

  const goBack = useCallback(() => dispatch({ type: 'back' }), [dispatch]);

  useInput(
    (_input, key) => {
      if (key.escape) {
        goBack();
      }
    },
    { isActive: !options?.disabled },
  );

  return { navigate, goBack };
}
