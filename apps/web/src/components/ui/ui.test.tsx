import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderApp } from '@/test/render';
import { ApiError } from '@/lib/api/errors';
import { ConfirmDialog, DataTable, Dialog, FormError, TextField } from '.';

describe('Dialog', () => {
  function Harness() {
    const [open, setOpen] = useState(false);
    return (
      <>
        <button onClick={() => setOpen(true)}>Open it</button>
        <Dialog open={open} onClose={() => setOpen(false)} title="A title">
          <p>Body text</p>
        </Dialog>
      </>
    );
  }

  it('opens with its title and closes with the close button', async () => {
    const user = userEvent.setup();
    renderApp(<Harness />);
    expect(screen.queryByText('Body text')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Open it' }));
    const dialog = document.querySelector('dialog') as HTMLDialogElement;
    expect(dialog).toHaveAttribute('open');
    expect(dialog).toHaveAccessibleName('A title');
    await user.click(within(dialog).getByRole('button', { name: 'Close' }));
    expect(screen.queryByText('Body text')).not.toBeInTheDocument();
  });
});

describe('ConfirmDialog', () => {
  it('confirms and cancels, and shows a translated error from the API code', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    renderApp(
      <ConfirmDialog open onClose={onClose} onConfirm={onConfirm} title="Sure?" confirmLabel="Do it" error={new ApiError({ status: 409, code: 'CONFLICT', detail: 'raw db error' })}>
        <p>Really?</p>
      </ConfirmDialog>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('This was changed by someone else');
    expect(document.body.textContent).not.toContain('raw db error');
    await user.click(screen.getByRole('button', { name: 'Do it' }));
    expect(onConfirm).toHaveBeenCalledOnce();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalled();
  });
});

describe('FormError', () => {
  it('maps codes to sentences and unknown values to the generic one', () => {
    const { rerender } = renderApp(<FormError error={new ApiError({ status: 0, code: 'NETWORK_ERROR' })} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Cannot reach the server.');
    rerender(<FormError error={new Error('boom')} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong. Please try again.');
    rerender(<FormError error={null} />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('TextField', () => {
  it('connects the label, hint and error to the input', () => {
    renderApp(<TextField label="Name" hint="As on the form" error="Enter the name." value="" onChange={() => {}} />);
    const input = screen.getByRole('textbox', { name: /Name/ });
    expect(input).toBeInvalid();
    expect(input).toHaveAccessibleDescription(/As on the form/);
    expect(input).toHaveAccessibleDescription(/Enter the name\./);
  });
});

describe('DataTable', () => {
  it('renders a real table with a caption, header cells and labelled cells for the phone layout', () => {
    renderApp(
      <DataTable
        caption="People"
        rows={[{ id: '1', name: 'Ananya' }]}
        rowKey={(r) => r.id}
        columns={[{ key: 'n', header: 'Name', mobileLabel: 'Name', cell: (r) => r.name }]}
      />,
    );
    const table = screen.getByRole('table', { name: 'People' });
    expect(within(table).getByRole('columnheader', { name: 'Name' })).toBeInTheDocument();
    expect(within(table).getByRole('cell', { name: 'Ananya' })).toHaveAttribute('data-label', 'Name');
  });

  it('shows the empty state in the table body', () => {
    renderApp(<DataTable caption="x" rows={[]} rowKey={() => ''} columns={[{ key: 'n', header: 'Name', cell: () => null }]} empty={<p>Nobody here</p>} />);
    expect(screen.getByText('Nobody here')).toBeInTheDocument();
  });
});
