# מאמן משיט 30

[English](README.md) | **עברית**

מאמן למבחני התיאוריה של רישיון משיט 30 (רספ״ן). האפליקציה בעברית ומימין לשמאל, עם מהדורה באנגלית
לשלושה מהמבחנים. היא מותאמת לנייד ועובדת גם בלי חיבור לרשת.

**[לפתיחת האפליקציה](https://meshit30.pages.dev)**

אין חשבונות, וכל ההתקדמות נשמרת במכשיר בלבד. נתוני שימוש מצטברים נאספים כברירת מחדל, בלי כתובת IP,
תשובות או ציונים, ואפשר לכבות את האיסוף במסך הבית. הפירוט ב-[`analytics/README.md`](analytics/README.md).

## הפעלה

נדרש Node.js בגרסה 20 ומעלה.

```sh
npm install
npm run content   # בונה את הקבצים הנגזרים מכל נושא פעיל ומאמת אותם
npm run dev
```

`npm run build` מוסיף גם את ה-service worker, ו-`npm test` מריץ את בדיקות היחידה. כל דחיפה ל-master
נפרסת אוטומטית ל-Cloudflare Pages דרך `.github/workflows/deploy.yml`.

## עריכת תוכן מקומית

`npm run dev` ואז `http://localhost:5173/admin` — טופס לעריכת שאלות, תשובות ומונחים של כל הנושאים.
כל שמירה נכתבת לקובץ המקור (`questions.json` לשאלה, `term-overrides.json` למונח), בונה מחדש את
הנגזרים ומריצה את הוולידציה. מה שנשאר הוא diff ב-git לבדיקה ולקומיט.

הטופס קיים רק בשרת הפיתוח (`scripts/admin-server.mjs`, `src/screens/Admin.jsx`) ולא נבנה לפרודקשן.
הוא עונה מ-localhost ומכתובות של רשת פרטית, ולכן כדאי להריץ את שרת הפיתוח רק ברשת מהימנה.

## איפה מה

| | |
|---|---|
| `subjects/` | מאגרי השאלות ודפי הריכוז — נושא לכל תיקייה. חוזה הקבצים: [`subjects/README.md`](subjects/README.md) |
| `src/` | האפליקציה: `screens/` מסכים, `lib/` לוגיקה, `subjects/loader.js` טעינת תוכן |
| `functions/` | Cloudflare Pages Functions — נקודת הקצה של נתוני השימוש |
| `analytics/` | הקמה ושאילתות לנתוני השימוש: [`analytics/README.md`](analytics/README.md) |
| `scripts/` | בניית התוכן, ואכיפת החוזים (`check-theme.mjs`, `validate-subject.mjs`) |
| `test/` | בדיקות יחידה |

הוספת נושא היא הוספת תוכן בלבד, בלי שינוי קוד — הפירוט ב-`subjects/README.md`.

## מצאתם טעות?

אפשר [לפתוח דיווח](https://github.com/alono/meshit30/issues/new?template=content-error.yml) או לכתוב
אל [meshit@ohad.info](mailto:meshit@ohad.info). לתרומת קוד: [`CONTRIBUTING.md`](CONTRIBUTING.md).

## רישיון וכתב ויתור

הקוד מופץ ברישיון [MIT](LICENSE). תוכן הבחינות, התמונות שנגזרו ממנו והלוגו אינם כלולים ברישיון —
הפירוט ב-[`NOTICE.md`](NOTICE.md).

זהו כלי עזר עצמאי ללימוד, ללא קשר לרספ״ן או לכל גוף רשמי אחר. ייתכנו בו שגיאות, ולכן חשוב לבדוק מול
[החומר הרשמי](https://www.gov.il/he/pages/exame_small_vessel).
