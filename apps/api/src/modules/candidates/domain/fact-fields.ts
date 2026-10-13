import type { Permission, UpdateFactsBody } from '@iskcon/contracts';

type FactField = keyof UpdateFactsBody;

/**
 * Who may write each fact. The mentor knows when the devotee began practising; the temple office
 * records dates and results it holds on paper. One table, so a new fact is one line.
 */
export const FACT_PERMISSION: Record<FactField, Permission> = {
  practiceSince: 'application:set-practice',
  shelterDate: 'application:set-temple-facts',
  examStatus: 'application:set-temple-facts',
  courseComplete: 'application:set-temple-facts',
  firstInitiationDate: 'application:set-temple-facts',
  guruChangedOn: 'application:set-temple-facts',
  returnedOn: 'application:set-temple-facts',
};

export const FACT_FIELDS = Object.keys(FACT_PERMISSION) as FactField[];
