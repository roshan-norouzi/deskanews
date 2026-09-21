'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch, ApiError, TENANT_CHANGED_EVENT, getTenantId, type ApiFetchOptions } from '@/lib/utils';

interface UseApiState<T> {
  data: T | null;
  error: string | null;
  isLoading: boolean;
}

interface UseApiOptions<T> extends ApiFetchOptions {
  immediate?: boolean;
  initialData?: T | null;
  onSuccess?: (data: T) => void;
  onError?: (error: string) => void;
}

export function useApi<T = unknown>(
  path: string | null,
  options: UseApiOptions<T> = {},
) {
  const { immediate = true, initialData = null, onSuccess, onError, skipTenant = false, ...fetchOptions } = options;
  const [state, setState] = useState<UseApiState<T>>({
    data: initialData,
    error: null,
    isLoading: immediate && !!path,
  });
  const [tenantEpoch, setTenantEpoch] = useState(0);

  const fetchOptionsRef = useRef(fetchOptions);
  fetchOptionsRef.current = fetchOptions;
  const onSuccessRef = useRef(onSuccess);
  const onErrorRef = useRef(onError);
  const requestSequenceRef = useRef(0);
  const loadedTenantRef = useRef<string | null | undefined>(skipTenant ? null : undefined);
  onSuccessRef.current = onSuccess;
  onErrorRef.current = onError;

  const requestTenant = skipTenant ? null : getTenantId();
  const tenantChanged = loadedTenantRef.current !== requestTenant;
  const visibleState = tenantChanged
    ? { data: initialData, error: null, isLoading: immediate && !!path }
    : state;

  const execute = useCallback(async (overridePath?: string, overrideOptions?: ApiFetchOptions) => {
    const targetPath = overridePath ?? path;
    if (!targetPath) return null;
    const requestSequence = ++requestSequenceRef.current;
    const nextTenant = skipTenant ? null : getTenantId();

    setState((prev) => (
      loadedTenantRef.current !== nextTenant
        ? { data: initialData, error: null, isLoading: true }
        : { ...prev, isLoading: true, error: null }
    ));

    try {
      const data = await apiFetch<T>(targetPath, { ...fetchOptionsRef.current, skipTenant, ...overrideOptions });
      if (requestSequence !== requestSequenceRef.current) return data;
      loadedTenantRef.current = nextTenant;
      setState({ data, error: null, isLoading: false });
      onSuccessRef.current?.(data);
      return data;
    } catch (err) {
      if (requestSequence !== requestSequenceRef.current) return null;
      loadedTenantRef.current = nextTenant;
      const message = err instanceof ApiError ? err.message : 'خطای ناشناخته';
      setState({ data: initialData, error: message, isLoading: false });
      onErrorRef.current?.(message);
      return null;
    }
  }, [path, skipTenant, initialData]);

  const refetch = useCallback(() => execute(), [execute]);

  const mutate = useCallback((data: T | null) => {
    setState((prev) => ({ ...prev, data }));
  }, []);

  const reset = useCallback(() => {
    requestSequenceRef.current += 1;
    setState({ data: initialData, error: null, isLoading: false });
  }, [initialData]);

  useEffect(() => {
    if (skipTenant) return;
    const onTenantChanged = () => setTenantEpoch((current) => current + 1);
    window.addEventListener(TENANT_CHANGED_EVENT, onTenantChanged);
    return () => window.removeEventListener(TENANT_CHANGED_EVENT, onTenantChanged);
  }, [skipTenant]);

  useEffect(() => {
    if (immediate && path) {
      void execute();
    }
  }, [execute, immediate, path, tenantEpoch]);

  return {
    ...visibleState,
    execute,
    mutate,
    reset,
    refetch,
  };
}

export function useMutation<TBody = unknown, TResult = unknown>(
  path: string,
  method: 'POST' | 'PATCH' | 'PUT' | 'DELETE' = 'POST',
) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mutate = useCallback(
    async (body?: TBody, overridePath?: string) => {
      setIsLoading(true);
      setError(null);

      try {
        const result = await apiFetch<TResult>(overridePath ?? path, {
          method,
          body,
        });
        setIsLoading(false);
        return result;
      } catch (err) {
        const message = err instanceof ApiError ? err.message : 'خطای ناشناخته';
        setError(message);
        setIsLoading(false);
        throw err;
      }
    },
    [path, method],
  );

  return { mutate, isLoading, error };
}
