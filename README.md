# Ifah — Cycle & Wellness Tracker v2

Mobile-first redesign of the existing GitHub Pages + Supabase project. This release **does not implement an offline database, phone-to-phone restore, authentication migration, or any Supabase schema changes**. Those are separate future milestones.

## What's new

- Refined, responsive layout for small phones and desktop, comfortable color palette, optional dark mode, fixed five-item mobile navigation.
- Home: cycle progress ring, estimated phase, next period and uncertainty range, mood outlook, quick mood check-in, personal tracking snapshot.
- Calendar: month navigation, *recorded* period days visually distinguished from future *estimated* period windows and calendar-based ovulation windows, daily-log markers, selected date details.
- Daily tracking: moods, flow, cramps, multi-select symptom chips, notes, and editing existing log records with prior answers prefilled.
- Separate period-start and period-end controls with validation, plus editing of existing period dates from History.
- Insights: robust start-to-start cycle calculations, estimated bleeding duration, cycle variation, trend bars, recorded mood frequencies, and cautiously worded personalized mood patterns.
- History: period and log tabs, search, edit, and confirmation before deleting.
- Demo mode with sample data at `?demo=1` for reviewing the UI without writing to Supabase.
- All rows read from the existing tables, including pagination beyond the default 1,000-row query size.

## Files

| File | Role |
| --- | --- |
| `index.html` | All screens and navigation |
| `style.css` | Mobile-first visual design and dark theme |
| `app.js` | Supabase data operations, forms, navigation and rendering |
| `forecast.js` | Pure forecast and mood pattern functions |
| `config.js` | **Existing**, unchanged public Supabase project URL and anon key |
| `tests/forecast.test.js` | Node-only unit tests for forecast/date edge cases |

**No third-party dependency except Supabase's JavaScript CDN.** No build process required.

## Deploy to GitHub Pages

1. Download and **extract the ZIP**. Preserve its folder structure. Copy `index.html`, `style.css`, `app.js`, `forecast.js`, and `config.js` to the **published root of your existing GitHub Pages repository**. The README and `tests/` are optional in the deployed repository.
2. Make a copy of your current repository first, or create a Git branch so you can roll back easily. Do not overwrite your old version without preserving a copy.
3. Check that your Pages settings publish the branch/folder where `index.html` lives.
4. Commit and push to GitHub. For example, from your existing repository after copying the new files:

   ```bash
   git add index.html style.css app.js forecast.js config.js
   git commit -m "Redesign Ifah dashboard, calendar and cycle insights"
   git push origin main
   ```

5. Open the Pages URL normally to read/write the **existing** Supabase tables. Open `https://YOUR-URL/?demo=1` to preview with sample records, no database writes.
6. Check the History tab after deploying to verify that your real historical records display correctly. Verify that changes save only after you are confident about your site's database permissions.

This is a code deliverable, **not a deployed website**. The live Supabase data has not been connected or tested by the authoring environment. The new site reads the same table names and columns as the original archive. No database migrations or destructive SQL are included.

## Existing database schema assumptions

- `periods`: `id`, `start_date` (`YYYY-MM-DD`), `end_date` (date or null)
- `daily_logs`: `id`, `log_date` (`YYYY-MM-DD`), `flow`, `severity`, `mood`, `symptoms`
- `daily_logs.log_date` is unique/has a matching conflict constraint, as used by your original `.upsert(...,{onConflict:'log_date'})` implementation.
- Existing table permissions allow the same public client operations as your old app. **This release does not change, verify, or secure those permissions.**

If your real Supabase schema differs from the original JavaScript expectations, the code needs a corresponding adjustment before use.

## Forecast model: what it does and does not do

- Computes actual start-to-start lengths for period starts; uses the most recent valid intervals between 15 and 90 days.
- Uses a robust median with recency weighting. A markedly different isolated interval may be excluded from the forecast (not from the database/history) because it could represent a missed log; this lowers forecast reliability.
- Uses historical variation and simple retrospective errors to provide an approximate date window. The window is **not a calibrated probability/confidence interval**.
- Requires at least two period starts for a history-based period date estimate.
- Assigns estimated follicular, ovulatory and luteal timing by cycle-day arithmetic. It does not confirm ovulation or physiological state.
- Mood forecasting only reports an observed tendency when it has sufficient recorded examples from at least three different completed cycles; otherwise it abstains. It does not claim that hormones or a phase caused a mood.
- An overdue estimate is explicitly labeled as needing an update, not silently rolled into a future cycle.

**Medical limitation:** Calendar forecasts cannot verify ovulation, diagnose disease, or tell someone when they can avoid pregnancy without contraception. Symptoms and moods vary widely between people and cycles. Consult a clinician for concerning changes or symptoms.

## Changing theme

Tap the moon/sun icon in the header. The browser stores only this display preference. **No offline data storage or transfer is implemented.**

## Basic testing

```bash
node tests/forecast.test.js
```

Check the site at narrow phone widths (e.g. 360px and 390px) and larger screens. A working internet connection is necessary to load the Supabase client library and your live records.

## Future milestone (not built here)

Replace the online database with fully local device storage, then add verified backup/export and import/restore on another phone while maintaining historical data accuracy. This is intentionally postponed as requested.
