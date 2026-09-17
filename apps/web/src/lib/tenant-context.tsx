'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { apiFetch, getTenantId, setTenantId, clearTenantId } from './utils';
import { useAuth } from './auth-context';

export interface TenantInfo {
  id: string;
  name: string;
  slug: string;
  plan: string;
  locale?: string;
  memberRole?: string;
}

export interface TenantDetail extends TenantInfo {
  settings?: Record<string, unknown>;
  enabledModules?: string[];
}

interface TenantContextValue {
  tenants: TenantInfo[];
  activeTenant: TenantInfo | null;
  activeTenantId: string | null;
  isLoading: boolean;
  setActiveTenant: (tenantId: string) => void;
  refreshTenants: () => Promise<void>;
  refreshCurrentTenant: () => Promise<TenantDetail | null>;
}

const TenantContext = createContext<TenantContextValue | null>(null);

export function TenantProvider({ children }: { children: ReactNode }) {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const [tenants, setTenants] = useState<TenantInfo[]>([]);
  const [activeTenantId, setActiveTenantIdState] = useState<string | null>(() =>
    typeof window !== 'undefined' ? getTenantId() : null,
  );
  const [isLoading, setIsLoading] = useState(true);

  const refreshTenants = useCallback(async () => {
    if (!isAuthenticated) {
      setTenants([]);
      return;
    }

    const list = await apiFetch<TenantInfo[]>('/tenants', { skipTenant: true });
    setTenants(list);

    const stored = getTenantId();
    if (stored && list.some((t) => t.id === stored)) {
      setActiveTenantIdState(stored);
    } else if (list.length === 1) {
      setActiveTenantIdState(list[0].id);
      setTenantId(list[0].id);
    } else {
      setActiveTenantIdState(null);
      clearTenantId();
    }
  }, [isAuthenticated]);

  const refreshCurrentTenant = useCallback(async () => {
    if (!activeTenantId) return null;
    return apiFetch<TenantDetail>('/tenants/current');
  }, [activeTenantId]);

  useEffect(() => {
    const load = async () => {
      if (authLoading) return;

      setIsLoading(true);
      try {
        if (isAuthenticated && user) {
          if (user.tenants?.length) {
            const mapped: TenantInfo[] = user.tenants.map((t) => ({
              id: t.id,
              name: t.name,
              slug: t.slug,
              plan: t.plan,
              locale: t.locale,
              memberRole: t.memberRole,
            }));
            setTenants(mapped);

            const stored = getTenantId();
            if (stored && mapped.some((t) => t.id === stored)) {
              setActiveTenantIdState(stored);
            } else if (mapped.length === 1) {
              setActiveTenantIdState(mapped[0].id);
              setTenantId(mapped[0].id);
            } else {
              setActiveTenantIdState(null);
              clearTenantId();
            }
          } else {
            await refreshTenants();
          }
        } else {
          setTenants([]);
          setActiveTenantIdState(null);
          clearTenantId();
        }
      } catch {
        setTenants([]);
      } finally {
        setIsLoading(false);
      }
    };

    void load();
  }, [authLoading, isAuthenticated, user, refreshTenants]);

  const setActiveTenant = useCallback((tenantId: string) => {
    setActiveTenantIdState(tenantId);
    setTenantId(tenantId);
  }, []);

  const activeTenant = useMemo(
    () => tenants.find((t) => t.id === activeTenantId) ?? null,
    [tenants, activeTenantId],
  );

  const value = useMemo(
    () => ({
      tenants,
      activeTenant,
      activeTenantId,
      isLoading: authLoading || isLoading,
      setActiveTenant,
      refreshTenants,
      refreshCurrentTenant,
    }),
    [tenants, activeTenant, activeTenantId, authLoading, isLoading, setActiveTenant, refreshTenants, refreshCurrentTenant],
  );

  return <TenantContext.Provider value={value}>{children}</TenantContext.Provider>;
}

export function useTenant() {
  const ctx = useContext(TenantContext);
  if (!ctx) throw new Error('useTenant must be used within TenantProvider');
  return ctx;
}
