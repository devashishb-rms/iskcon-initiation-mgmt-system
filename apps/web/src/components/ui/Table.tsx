import type { ReactNode } from 'react';

export interface Column<T> {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  /** Label shown beside the value when the table collapses into cards on a phone. */
  mobileLabel?: string;
  className?: string;
  /** Visually hidden header (action columns). */
  srOnlyHeader?: boolean;
}

export interface DataTableProps<T> {
  caption: string;
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  empty?: ReactNode;
}

/** A real <table> on wide screens; the same markup becomes a stack of labelled cards on a phone (CSS only). */
export function DataTable<T>({ caption, columns, rows, rowKey, empty }: DataTableProps<T>) {
  return (
    <div className="tablewrap">
      <table className="data">
        <caption className="sr">{caption}</caption>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} scope="col" className={c.className}>
                {c.srOnlyHeader ? <span className="sr">{c.header}</span> : c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr className="empty-row">
              <td colSpan={columns.length}>{empty}</td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={rowKey(row)}>
                {columns.map((c) => (
                  <td key={c.key} data-label={c.mobileLabel} className={c.className}>
                    {c.cell(row)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
