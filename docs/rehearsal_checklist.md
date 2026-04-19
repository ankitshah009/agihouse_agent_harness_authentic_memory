# Pre-demo rehearsal checklist (run this 30 min before judging)

## Env
- [ ] `.env` file exists with DATABASE_URL, DAYTONA_API_KEY, EXA_API_KEY set
- [ ] `make prewarm` returns ok within 3s
- [ ] Laptop battery > 70%, charger nearby

## Backend sanity
- [ ] `AML_BACKEND=tidb make seed` prints the killer SQL and a recommendation without error
- [ ] `make test` passes or has only expected skips (Daytona/Exa without keys)

## Frontend sanity
- [ ] `pnpm build` passes
- [ ] Open http://127.0.0.1:3000 — header shows `TiDB Cloud · HNSW` pill (green)
- [ ] Run a scenario → killer-SQL panel appears, elapsedMs badge pulses sub-200ms
- [ ] Run all phases → update-cycle trace shows 4 steps, Exa surfaces at least 1 hit
- [ ] "Download audit bundle" triggers a file download, JSON is valid

## Narrative
- [ ] 3-minute pitch memorized: problem → architecture → live killer SQL → update cycle → audit
- [ ] Fallback ready: if TiDB drops out, `AML_BACKEND=sqlite pnpm demo` still works — label clearly as dev mode
- [ ] Backup slides open in another window (PDF of architecture diagram)

## Known-working fallbacks
- If Daytona is down: demo shows `Daytona —` badge; narrative pivots to "code reviewed by local replay" — still sells the architecture
- If Exa is down: update-cycle trace step 3 shows "no adversarial signal" — honest, not broken
- If TiDB network cuts mid-demo: ScenarioConsole still runs against SQLite fallback — announce it, don't hide it

## Deep breath
- [ ] Water bottle, pen, notepad
- [ ] Judges' names and what they care about on a sticky note
