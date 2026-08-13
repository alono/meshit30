import { useMemo } from 'react';

/**
 * Small markdown renderer for the cheat sheet — headings, tables, lists, bold
 * and inline code. A dependency would be overkill for one known document, and
 * this keeps the app free of a markdown parser in the bundle.
 *
 * Everything is escaped before any markup is produced, so the cheat sheet can
 * never inject HTML.
 */
export default function Markdown({ source }) {
  const html = useMemo(() => render(source ?? ''), [source]);
  return <div className="sheet" dangerouslySetInnerHTML={{ __html: html }} />;
}

const escape = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const inline = (s) =>
  escape(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

function render(source) {
  const lines = source.split(/\r?\n/);
  const out = [];
  let list = null;
  let table = null;

  const closeList = () => { if (list) { out.push(`</${list}>`); list = null; } };
  const closeTable = () => { if (table) { out.push('</tbody></table>'); table = null; } };

  const cells = (line) => line.replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());

  for (const raw of lines) {
    const line = raw.trim();

    if (line.startsWith('|')) {
      closeList();
      const parts = cells(line);
      if (parts.every((c) => /^:?-{2,}:?$/.test(c))) continue; // separator row
      if (!table) {
        table = true;
        out.push('<table><thead><tr>' + parts.map((c) => `<th>${inline(c)}</th>`).join('') + '</tr></thead><tbody>');
        continue;
      }
      out.push('<tr>' + parts.map((c) => `<td>${inline(c)}</td>`).join('') + '</tr>');
      continue;
    }
    closeTable();

    if (!line) { closeList(); continue; }

    const heading = line.match(/^(#{1,4})\s+(.*)$/);
    if (heading) {
      closeList();
      const level = Math.min(heading[1].length + 1, 5);
      out.push(`<h${level}>${inline(heading[2])}</h${level}>`);
      continue;
    }

    if (line.startsWith('---')) { closeList(); out.push('<hr />'); continue; }

    const ordered = line.match(/^\d+\.\s+(.*)$/);
    const bullet = line.match(/^[-*]\s+(.*)$/);
    if (ordered || bullet) {
      const want = ordered ? 'ol' : 'ul';
      if (list !== want) { closeList(); list = want; out.push(`<${want}>`); }
      out.push(`<li>${inline((ordered ?? bullet)[1])}</li>`);
      continue;
    }
    closeList();

    if (line.startsWith('>')) { out.push(`<blockquote>${inline(line.slice(1).trim())}</blockquote>`); continue; }

    out.push(`<p>${inline(line)}</p>`);
  }

  closeList();
  closeTable();
  return out.join('\n');
}
