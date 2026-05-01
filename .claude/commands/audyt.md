---
description: Pełen audyt obu repo (frontend + infrastructure) przez agenta auditor
---

Wywołaj subagenta `auditor` żeby zrobił pełen audyt **obu repo** projektu sprawdzamszlak.pl:
- `sprawdzamszlak-frontend` (Next.js)
- `sprawdzamszlak-infrastructure` (Terraform + AWS Lambda + DynamoDB + S3)

Najpierw upewnij się że oba katalogi są dostępne. Jeśli pracujesz w jednym z nich, zapytaj właściciela o ścieżkę do drugiego.

Po otrzymaniu raportu od auditora:
1. Pokaż raport w całości
2. Wskaż **3 najpilniejsze rzeczy** do zaadresowania, w kolejności
3. Dla każdej zaproponuj który subagent powinien wejść (`architect`, `security`, `aws-infra`, `frontend-designer`, `integrator`)
4. **Nie zaczynaj implementacji.** Czekaj na decyzję właściciela.

Sugeruj jako naturalny next step uruchomienie:
- `@architect` — dla pierwszego ADR o stacku i strukturze monorepo
- `/security-check` — dla weryfikacji ryzyk security z audytu
