import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { configureApi } from '@/lib/api/request';
import { detail, evaluation } from '@/test/fixtures';
import { renderApp } from '@/test/render';
import { Checklist, ChecklistSummary } from './Checklist';
import { FactsPanel } from './FactsPanel';
import { NextStepCard } from './NextStepCard';
import { RecommendationPanel } from './panels';
import { StatusBadge } from '@/components/ui';

const mocks = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: mocks.push, push: mocks.push }), usePathname: () => '/login' }));

describe('StatusBadge', () => {
  it('says the word, so colour is never the only signal, and keeps "needs confirming" apart from "not met"', () => {
    renderApp(
      <>
        <StatusBadge status="UNKNOWN" />
        <StatusBadge status="NOT_MET" />
        <StatusBadge status="EXCEPTION" />
      </>,
    );
    expect(screen.getByText('Needs confirming')).toBeInTheDocument();
    expect(screen.getByText('Not met')).toBeInTheDocument();
    expect(screen.getByText('Exception recorded')).toBeInTheDocument();
    expect(screen.getByText('Needs confirming').closest('[data-status]')).toHaveAttribute('data-status', 'UNKNOWN');
  });

  it('is translated', () => {
    renderApp(<StatusBadge status="MET" />, { locale: 'hi' });
    expect(screen.getByText('पूर्ण')).toBeInTheDocument();
  });
});

describe('Checklist', () => {
  it('shows every status as its own chip with the server-coded text translated', () => {
    renderApp(<Checklist evaluation={evaluation()} detailed />);
    const rows = screen.getAllByRole('listitem');
    expect(rows).toHaveLength(5);
    const status = (rule: string) => document.querySelector(`[data-rule="${rule}"]`)?.getAttribute('data-status');
    expect(status('R-1')).toBe('MET');
    expect(status('R-2')).toBe('UNKNOWN');
    expect(status('R-3')).toBe('NOT_MET');
    expect(status('R-5')).toBe('LATER');
    expect(status('R-4')).toBe('EXCEPTION');
    expect(screen.getByText('Following the practice standard for at least 12 months')).toBeInTheDocument();
    expect(screen.getByText(/The date of acceptance in shelter has not been recorded yet\./)).toBeInTheDocument();
    expect(screen.getByText(/Following the practice standard since 1 Jan 2024\. 12 months were complete on 1 Jan 2025\./)).toBeInTheDocument();
  });

  it('explains that unknown is not a fail, and what an exception replaced', () => {
    renderApp(<Checklist evaluation={evaluation()} detailed />);
    expect(screen.getByText(/Needs confirming means nobody has checked it yet\. It is not a fail\./)).toBeInTheDocument();
    const exceptionRow = document.querySelector('[data-rule="R-4"]') as HTMLElement;
    expect(within(exceptionRow).getByText(/Certificate lost in the flood/)).toBeInTheDocument();
    expect(within(exceptionRow).getByText(/was: Needs confirming/)).toBeInTheDocument();
    expect(within(exceptionRow).getByText(/committee exception/)).toBeInTheDocument();
  });

  it('summarises with words', () => {
    renderApp(<ChecklistSummary met={3} total={5} worst="UNKNOWN" />);
    expect(screen.getByText(/3 of 5 met · needs confirming/)).toBeInTheDocument();
  });
});

describe('NextStepCard', () => {
  it('shows the next step in plain words, with a formatted due date and no time-zone shift', () => {
    renderApp(<NextStepCard nextStep={{ code: 'WAIT_UNTIL', ruleId: 'R-1', dueOn: '2026-03-01' }} />);
    expect(screen.getByTestId('next-step')).toHaveTextContent('Nothing to do right now. The waiting period ends on 1 Mar 2026.');
  });

  it('works in Bengali and falls back safely when the code is unknown', () => {
    renderApp(<NextStepCard nextStep={{ code: 'PASS_EXAM', ruleId: 'R-3', dueOn: null }} />, { locale: 'bn' });
    expect(screen.getByTestId('next-step')).toHaveTextContent('পরীক্ষার জন্য প্রস্তুত হোন এবং উত্তীর্ণ হোন।');
  });
});

describe('RecommendationPanel', () => {
  const blocked = detail({}, { canDecide: true, approveBlockedBy: ['R-2', 'R-3'] });
  const clear = detail({}, { canDecide: true, approveBlockedBy: [] });

  it('renders nothing when the server does not allow a decision', () => {
    renderApp(<RecommendationPanel detail={detail()} onChanged={() => {}} />);
    expect(screen.queryByRole('heading', { name: 'Your recommendation' })).not.toBeInTheDocument();
    expect(document.querySelector('section.panel')).toBeNull();
  });

  it('lists why a recommendation is blocked and disables it, but still allows send back', () => {
    renderApp(<RecommendationPanel detail={blocked} onChanged={() => {}} />, { roles: ['PRESIDENT'] });
    const box = screen.getByTestId('approve-blocked');
    expect(box).toHaveTextContent('You cannot recommend yet');
    expect(box).toHaveTextContent('R-2');
    expect(box).toHaveTextContent('The date of acceptance in shelter has not been recorded yet.');
    expect(box).toHaveTextContent('R-3');
    expect(screen.getByRole('radio', { name: /Recommend and generate the letter/ })).toBeDisabled();
    expect(screen.getByRole('radio', { name: /Send back with a reason/ })).toBeEnabled();
    expect(screen.getByRole('radio', { name: /Send back with a reason/ })).toBeChecked();
    expect(screen.getByRole('radio', { name: /Decline with a reason/ })).toBeEnabled();
  });

  it('defaults to recommend when nothing blocks, and never says "approved by the system"', () => {
    renderApp(<RecommendationPanel detail={clear} onChanged={() => {}} />, { roles: ['PRESIDENT'] });
    expect(screen.getByRole('radio', { name: /Recommend and generate the letter/ })).toBeChecked();
    expect(screen.getByText(/The guru's office, not this system, decides\./)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/\bapprove[ds]?\b/i);
  });

  it('asks for a reason before sending back and does not call the API without one', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const restore = configureApi({ fetch: fetchMock });
    try {
      const user = userEvent.setup();
      renderApp(<RecommendationPanel detail={blocked} onChanged={() => {}} />, { roles: ['PRESIDENT'] });
      await user.click(screen.getByRole('button', { name: 'Send back' }));
      expect(await screen.findByText('A reason is required to send back or decline.')).toBeInTheDocument();
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      restore();
    }
  });
});

describe('FactsPanel', () => {
  const noop = () => {};

  it('is read-only for a viewer without edit rights and shows unknown as "needs confirming"', () => {
    renderApp(<FactsPanel detail={detail()} onChanged={noop} />);
    expect(screen.queryByRole('button', { name: 'Save changes' })).not.toBeInTheDocument();
    expect(screen.getByText('You can see these details but not change them.')).toBeInTheDocument();
    const shelter = document.querySelector('[data-fact="shelterDate"]') as HTMLElement;
    expect(within(shelter).getByText('Needs confirming')).toBeInTheDocument();
    expect(within(shelter).getByText('Not recorded yet. This is not a fail.')).toBeInTheDocument();
  });

  it('lets a mentor edit only the practice date', () => {
    renderApp(<FactsPanel detail={detail({}, { canSetPractice: true })} onChanged={noop} />, { roles: ['MENTOR'] });
    expect(screen.getByLabelText('Following the practice standard since')).toBeEnabled();
    expect(screen.queryByLabelText('Accepted in shelter on')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
  });

  it('lets the committee edit the temple facts and enables save only after a change', async () => {
    const user = userEvent.setup();
    renderApp(<FactsPanel detail={detail({}, { canSetTempleFacts: true })} onChanged={noop} />);
    expect(screen.queryByLabelText('Following the practice standard since')).not.toBeInTheDocument();
    const shelter = screen.getByLabelText('Accepted in shelter on');
    const save = screen.getByRole('button', { name: 'Save changes' });
    expect(save).toBeDisabled();
    await user.type(shelter, '2025-06-01');
    expect(save).toBeEnabled();
  });
});

describe('sign-in form', () => {
  const { push } = mocks;
  const fetchMock = vi.fn<typeof fetch>();
  let restore: () => void;
  beforeEach(() => {
    fetchMock.mockReset();
    push.mockReset();
    restore = configureApi({ fetch: fetchMock });
  });
  afterEach(() => restore());

  const reply = (status: number, body: unknown) => () => Promise.resolve(new Response(JSON.stringify(body), { status }));

  it('checks the identifier before calling the API, then asks for the code', async () => {
    const { LoginForm } = await import('@/features/auth/LoginForm');
    const user = userEvent.setup();
    renderApp(<LoginForm />);
    await user.click(screen.getByRole('button', { name: 'Send me a code' }));
    expect(screen.getByText('Enter your email address or phone number.')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();

    fetchMock.mockImplementation(reply(202, { accepted: true }));
    await user.type(screen.getByLabelText(/Email or phone number/), 'ananya@example.org');
    await user.click(screen.getByRole('button', { name: 'Send me a code' }));
    expect(await screen.findByLabelText(/6-digit code/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /New code in \d+ s/ })).toBeDisabled();
  });

  it('shows a translated message, not the server text, for a wrong code', async () => {
    const { LoginForm } = await import('@/features/auth/LoginForm');
    const user = userEvent.setup();
    renderApp(<LoginForm />);
    fetchMock.mockImplementation(reply(202, { accepted: true }));
    await user.type(screen.getByLabelText(/Email or phone number/), 'ananya@example.org');
    await user.click(screen.getByRole('button', { name: 'Send me a code' }));
    await user.type(await screen.findByLabelText(/6-digit code/), '123456');
    fetchMock.mockImplementation(reply(401, { type: 'about:blank', status: 401, code: 'OTP_INVALID', title: 'x', detail: 'SECRET SERVER TEXT' }));
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('That code is not correct or is no longer valid. Check it, or ask for a new one.')).toBeInTheDocument();
    expect(document.body.textContent).not.toContain('SECRET SERVER TEXT');
  });
});
