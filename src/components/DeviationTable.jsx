/**
 * The deviation table the exam hands out — needed for every compass-conversion
 * exercise, so it sits collapsed next to the questions rather than in the
 * cheat sheet. The data lives in questions.json (it is part of the paper).
 */
export default function DeviationTable({ table }) {
  if (!table?.length) return null;
  const fmt = (dev) => `${Math.abs(dev)}° ${dev < 0 ? 'W' : 'E'}`;
  const half = Math.ceil(table.length / 2);

  return (
    <details className="card devtable">
      <summary>טבלת דוויאציה (מצורפת לבחינה)</summary>
      <table className="topics" dir="ltr" style={{ textAlign: 'left' }}>
        <thead>
          <tr>
            <th>CC</th>
            <th>DEV</th>
            <th>CC</th>
            <th>DEV</th>
          </tr>
        </thead>
        <tbody>
          {table.slice(0, half).map((row, i) => {
            const twin = table[half + i];
            return (
              <tr key={row.cc}>
                <td>{String(row.cc).padStart(3, '0')}°</td>
                <td>{fmt(row.dev)}</td>
                <td>{twin ? `${String(twin.cc).padStart(3, '0')}°` : ''}</td>
                <td>{twin ? fmt(twin.dev) : ''}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="meta">בין השורות יש לבצע אינטרפולציה לפי הקורס המדויק.</p>
    </details>
  );
}
