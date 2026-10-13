'use client';

import type { ApplicationDetail } from '@iskcon/contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { applicationsApi } from '@/lib/api';

export const applicationKey = (id: string) => ['application', id] as const;
export const MY_PATH_KEY = ['my-path'] as const;

export const useApplication = (id: string) => useQuery({ queryKey: applicationKey(id), queryFn: () => applicationsApi.get(id) });
export const useMyPath = () => useQuery({ queryKey: MY_PATH_KEY, queryFn: applicationsApi.myPath });

/**
 * Call after any change: the server's fresh `ApplicationDetail` replaces the cached copy at once
 * (so checklist, next step and actions stay consistent), then everything derived is refetched.
 */
export function useApplicationRefresh() {
  const qc = useQueryClient();
  return useCallback(
    (detail?: ApplicationDetail) => {
      if (detail) {
        qc.setQueryData(applicationKey(detail.applicationId), detail);
        qc.setQueryData(MY_PATH_KEY, (old: ApplicationDetail | undefined) => (old && old.applicationId === detail.applicationId ? detail : old));
      }
      void qc.invalidateQueries({ queryKey: ['application'] });
      void qc.invalidateQueries({ queryKey: MY_PATH_KEY });
      void qc.invalidateQueries({ queryKey: ['timeline'] });
      void qc.invalidateQueries({ queryKey: ['notes'] });
      void qc.invalidateQueries({ queryKey: ['candidates'] });
      void qc.invalidateQueries({ queryKey: ['review-queue'] });
    },
    [qc],
  );
}
