import { useState, useCallback } from 'react';

/**
 * Custom hook for handling async API calls with loading and error states
 * @param {Function} asyncFunction
 * @returns {Object} { execute, loading, error, data, reset }
 */
export const useAsync = (asyncFunction) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);

  const execute = useCallback(
    async (...args) => {
      setLoading(true);
      setError(null);
      try {
        const response = await asyncFunction(...args);
        setData(response);
        return response;
      } catch (err) {
        setError(err);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [asyncFunction]
  );

  const reset = useCallback(() => {
    setLoading(false);
    setError(null);
    setData(null);
  }, []);

  return { execute, loading, error, data, reset };
};

/**
 * Hook to fetch initial data on component mount
 * @param {Function} asyncFunction 
 * @param {Array} dependencies
 * @param {boolean} executeOnMount
 * @returns {Object} { execute, loading, error, data, reset }
 */
export const useFetch = (asyncFunction, dependencies = [], executeOnMount = true) => {
  const [loading, setLoading] = useState(executeOnMount);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);

  const execute = useCallback(
    async (...args) => {
      setLoading(true);
      setError(null);
      try {
        const response = await asyncFunction(...args);
        setData(response);
        return response;
      } catch (err) {
        setError(err);
        console.error('Fetch error:', err);
      } finally {
        setLoading(false);
      }
    },
    [asyncFunction]
  );

  const reset = useCallback(() => {
    setLoading(false);
    setError(null);
    setData(null);
  }, []);

  React.useEffect(() => {
    if (executeOnMount) {
      execute();
    }
  }, dependencies);

  return { execute, loading, error, data, reset };
};

export default useAsync;
