import { useEffect, useRef, useState } from 'react';

/**
 * Blocking disclaimer shown once, before anything else.
 *
 * The pool is reproduced from a public document and this app repairs its
 * PDF-mangled text, so the notice says so plainly rather than in the abstract.
 * Nothing renders behind it until it is accepted; declining leads to a dead end
 * with a way back, and never into the app.
 */
export default function Disclaimer({ onAccept }) {
  const [declined, setDeclined] = useState(false);
  const acceptRef = useRef(null);

  // Hold focus on the primary action and stop the page behind from scrolling.
  useEffect(() => {
    acceptRef.current?.focus();
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [declined]);

  return (
    <div className="modal-backdrop">
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="disclaimer-title">
        {declined ? (
          <>
            <h2 id="disclaimer-title">לא ניתן להמשיך</h2>
            <p>השימוש באפליקציה מותנה באישור כתב הוויתור.</p>
            <div className="row end">
              <button type="button" className="btn" onClick={() => setDeclined(false)}>
                חזרה לכתב הוויתור
              </button>
            </div>
          </>
        ) : (
          <>
            <h2 id="disclaimer-title">כתב ויתור — נא לקרוא לפני השימוש</h2>

            <p>
              אפליקציה זו היא כלי עזר ללימוד עצמי בלבד. אין לה קשר לרספ״ן או לכל גוף רשמי אחר,
              והיא אינה מהווה חומר בחינה רשמי.
            </p>
            <p>
              מאגר השאלות שוחזר ממסמך ציבורי. ייתכנו בו שגיאות, שיבושי טקסט, ניסוחים לא מדויקים
              וסטיות מהנוסח הרשמי של הבחינה. חלק מהשאלות תוקנו או שוחזרו בשל פגמים בקובץ המקור,
              ובמקרים בודדים הנוסח המקורי אינו ניתן לשחזור מלא — שאלות כאלה מסומנות באפליקציה.
            </p>
            <p>
              אין להסתמך על התוכן כאן כתחליף לחומר הרשמי. השימוש הוא באחריות הבלעדית של מי שעושה
              בו שימוש, ואין כל אחריות לשגיאות, להשמטות, לשינויים שבוצעו בטקסט, לסטיות מהנוסח
              הרשמי או לתוצאות הבחינה.
            </p>
            <p>
              <b>
                המקור המחייב הוא{' '}
                <a href="https://www.gov.il/he/pages/exame_small_vessel" target="_blank" rel="noopener noreferrer">
                  החומר הרשמי של רספ״ן
                </a>{' '}
                בלבד.
              </b>
            </p>
            <p className="meta">
              האפליקציה אוספת נתוני שימוש מצטברים לשיפור הכלי: אילו מסכים נפתחו, מדינה וסוג מכשיר,
              ומזהה אקראי שנוצר במכשיר כדי לספור משתמשים חוזרים. אין עוגיות, אין שמות ואין איסוף
              מידע אישי. ההתקדמות עצמה נשמרת במכשיר בלבד ואינה נשלחת לשום מקום. אפשר לכבות את
              האיסוף במסך הבית.
            </p>

            <div className="row end">
              <button type="button" className="btn ghost" onClick={() => setDeclined(true)}>
                לא מאשרים
              </button>
              <button type="button" className="btn" ref={acceptRef} onClick={onAccept}>
                קראתי — אישור והמשך
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
