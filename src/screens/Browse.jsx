import { useState } from 'react';
import QuestionCard from '../components/QuestionCard.jsx';
import OpenQuestionCard from '../components/OpenQuestionCard.jsx';
import { strings } from '../lib/i18n.js';

/**
 * כל השאלות — the whole pool, answers shown, read only. The admin's question
 * list without the editing: filter by topic or text, then read down the page.
 */
export default function Browse({ subject }) {
  const t = strings(subject.lang);
  const [topic, setTopic] = useState(null);
  const [search, setSearch] = useState('');

  const list = subject.questions.filter((q) =>
    (!topic || q.topic === topic) &&
    (!search || `${q.id} ${q.question ?? ''} ${q.parts?.map((p) => p.question).join(' ') ?? ''} ${Object.values(q.options ?? {}).join(' ')}`.includes(search)),
  );
  const Card = subject.kind === 'open' ? OpenQuestionCard : QuestionCard;

  return (
    <>
      <div className="chips">
        {subject.topics.map((t) => (
          <button key={t.name} type="button" className={`chip ${topic === t.name ? 'on' : ''}`} onClick={() => setTopic(topic === t.name ? null : t.name)}>
            {t.name} ({t.count})
          </button>
        ))}
      </div>
      <input type="search" className="search" placeholder={t.search} value={search} onChange={(e) => setSearch(e.target.value)} />
      <p className="meta">{t.count(list.length)}</p>
      {list.map((q, i) => (
        <Card key={q.id} question={q} lang={subject.lang} terms={subject.termsById} reveal showNote index={i} total={list.length} />
      ))}
    </>
  );
}
