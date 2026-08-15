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

## איפה מה

| | |
|---|---|
| `subjects/` | מאגרי השאלות ודפי הריכוז — נושא לכל תיקייה. חוזה הקבצים: [`subjects/README.md`](subjects/README.md) |
| `src/` | האפליקציה: `screens/` מסכים, `lib/` לוגיקה, `subjects/loader.js` טעינת תוכן |
| `functions/` | Cloudflare Pages Functions — נקודת הקצה של נתוני השימוש |
| `analytics/` | הקמה ושאילתות לנתוני השימוש: [`analytics/README.md`](analytics/README.md) |
| `scripts/` | בניית התוכן, ואכיפת החוזים (`check-theme.mjs`, `validate-subject.mjs`) |

הוספת נושא היא הוספת תוכן בלבד, בלי שינוי קוד — הפירוט ב-`subjects/README.md`.
