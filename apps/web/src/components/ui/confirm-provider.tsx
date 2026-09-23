'use client';

import {
  createContext,
  useCallback,
  useContext,
  useId,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Button } from '@/components/ui/button';
import { Modal, ModalBody, ModalFooter, ModalFrame, ModalHeader } from '@/components/ui/modal';

export interface ConfirmOptions {
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'primary';
}

type ConfirmState = ConfirmOptions & { open: true };

interface ConfirmContextValue {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
}

const ConfirmContext = createContext<ConfirmContextValue | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const titleId = useId();
  const [state, setState] = useState<ConfirmState | null>(null);
  const resolveRef = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve;
      setState({ ...options, open: true });
    });
  }, []);

  const finish = (result: boolean) => {
    resolveRef.current?.(result);
    resolveRef.current = null;
    setState(null);
  };

  const variant = state?.variant ?? 'primary';

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      {state && (
        <Modal open labelledBy={titleId} onClose={() => finish(false)} size="sm" zIndex={90}>
          <ModalFrame>
            <ModalHeader
              title={<h2 id={titleId} className="text-lg font-bold text-slate-900">{state.title}</h2>}
              onClose={() => finish(false)}
            />
            <ModalBody className="px-6 py-4">
              <p className="text-sm leading-7 text-slate-600">{state.description}</p>
            </ModalBody>
            <ModalFooter>
              <div className="flex flex-wrap justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => finish(false)}>
                  {state.cancelLabel ?? 'انصراف'}
                </Button>
                <Button
                  type="button"
                  variant={variant === 'danger' ? 'danger' : 'primary'}
                  onClick={() => finish(true)}
                >
                  {state.confirmLabel ?? 'تأیید'}
                </Button>
              </div>
            </ModalFooter>
          </ModalFrame>
        </Modal>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) {
    throw new Error('useConfirm must be used within ConfirmProvider');
  }
  return ctx.confirm;
}
