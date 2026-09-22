# meshit30

מאמן למבחני התיאוריה של רישיון משיט 30 (רספ״ן). עברית בלבד, RTL, מותאם לנייד, עובד אופליין.
אין שרת ואין חשבונות — כל ההתקדמות נשמרת במכשיר.

```sh
npm install
npm run content   # בונה את הקבצים הנגזרים מכל נושא פעיל ומאמת אותם
npm run dev
```

`npm run build` מוסיף גם את ה-service worker. כל דחיפה ל-master נפרסת אוטומטית
ל-Cloudflare Pages דרך `.github/workflows/deploy.yml`.

## עריכת תוכן מקומית

`npm run dev` ואז `http://localhost:5173/admin` — טופס לעריכת שאלות, תשובות ומונחים של כל
הנושאים. כל שמירה נכתבת לקובץ המקור (`questions.json` לשאלה, `term-overrides.json` למונח),
בונה מחדש את הנגזרים ומריצה את הוולידציה; מה שנשאר הוא diff ב-git לבדיקה ולקומיט.
קיים רק בשרת הפיתוח (`scripts/admin-server.mjs`, `src/screens/Admin.jsx`) ועונה רק
מ-localhost — לא נבנה לפרודקשן.

## איפה מה

| | |
|---|---|
| `subjects/` | מאגרי השאלות ודפי הריכוז — נושא לכל תיקייה. חוזה הקבצים: [`subjects/README.md`](subjects/README.md) |
| `src/` | האפליקציה: `screens/` מסכים, `lib/` לוגיקה, `subjects/loader.js` טעינת תוכן |
| `functions/` | Cloudflare Pages Functions — נקודת הקצה של נתוני השימוש |
| `analytics/` | הקמה ושאילתות לנתוני השימוש: [`analytics/README.md`](analytics/README.md) |
| `scripts/` | בניית התוכן, ואכיפת החוזים (`check-theme.mjs`, `validate-subject.mjs`) |

הוספת נושא היא הוספת תוכן בלבד, בלי שינוי קוד — הפירוט ב-`subjects/README.md`.
