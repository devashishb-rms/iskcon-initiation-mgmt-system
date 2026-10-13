import type { FacetRegistry } from '../../../platform/facets/facets';
import type { ApplicationSummary } from '../../../shared/application-ports';
import { FacetGuruResponseReader } from './guru-response.reader';

const app: ApplicationSummary = {
  id: 'a1',
  candidateId: 'c1',
  candidateName: 'Anita Roy',
  candidateUserId: null,
  mentorId: null,
  guruId: 'g1',
  track: 'FIRST',
  stage: 'RECOMMENDED',
  status: 'OPEN',
};

const registryReturning = (latestGuruResponse: unknown): FacetRegistry =>
  ({ detail: jest.fn().mockResolvedValue({ latestGuruResponse }) }) as unknown as FacetRegistry;

describe('FacetGuruResponseReader', () => {
  it('returns the response the facets report', async () => {
    const reader = new FacetGuruResponseReader(registryReturning({ id: 'r', response: 'ACCEPTED', reason: null, recordedBy: 'x', recordedAt: '2026-10-01T00:00:00Z' }));
    await expect(reader.latest(app)).resolves.toBe('ACCEPTED');
  });

  it('returns null when no facet knows of an answer', async () => {
    await expect(new FacetGuruResponseReader(registryReturning(null)).latest(app)).resolves.toBeNull();
  });

  it('asks about the application it was given', async () => {
    const registry = registryReturning(null);
    await new FacetGuruResponseReader(registry).latest(app);
    expect(registry.detail).toHaveBeenCalledWith(app);
  });
});
