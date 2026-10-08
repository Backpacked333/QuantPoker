import { useId } from 'react'
export interface DataTableProps {
  caption: string
  summary: string
  columns: readonly string[]
  rows: readonly (readonly (string | number | null)[])[]
}
export function DataTable({ caption, summary, columns, rows }: DataTableProps) {
  const id = useId()
  return (
    <section className="qp-data-table">
      <p id={id}>{summary}</p>
      <div
        className="qp-table-scroll"
        tabIndex={0}
        role="region"
        aria-label={`${caption} scrollable table`}
      >
        <table aria-describedby={id}>
          <caption>{caption}</caption>
          <thead>
            <tr>
              {columns.map((c) => (
                <th scope="col" key={c}>
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i}>
                {row.map((cell, j) =>
                  j === 0 ? (
                    <th scope="row" key={j}>
                      {cell ?? 'Unavailable'}
                    </th>
                  ) : (
                    <td key={j}>
                      {cell === null ||
                      (typeof cell === 'number' && !Number.isFinite(cell))
                        ? 'Unavailable'
                        : cell}
                    </td>
                  ),
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
