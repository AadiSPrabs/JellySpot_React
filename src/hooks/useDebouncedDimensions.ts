import { useState, useEffect, useRef } from 'react';
import { useWindowDimensions, ScaledSize } from 'react-native';

/**
 * Debounced version of useWindowDimensions that only updates
 * after dimensions have been stable for `delay` ms.
 * Prevents cascading re-renders during orientation changes.
 */
export function useDebouncedDimensions(delay = 150): ScaledSize {
  const dimensions = useWindowDimensions();
  const [debounced, setDebounced] = useState(dimensions);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = setTimeout(() => {
      setDebounced(dimensions);
    }, delay);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [dimensions, delay]);

  return debounced;
}
