---
description: Sweep bezpieczeństwa przez agenta security
argument-hint: "[opcjonalnie: ścieżka lub obszar np. 'auth', 'webhooks', 'iam']"
---

Wywołaj subagenta `security` żeby przeszedł przez kod i znalazł potencjalne problemy bezpieczeństwa.

Zakres: $ARGUMENTS (jeśli puste — pełen sweep obu apps i infrastructure)

Po otrzymaniu raportu:
1. Wyświetl raport
2. Jeśli są findings 🚨 Critical — zaproponuj fix dla każdego po kolei, czekaj na akceptację przed zmianami
3. Jeśli tylko ⚠️ / ℹ️ — zapytaj czy wprowadzać zmiany teraz czy zapisać jako issues do późniejszego rozwiązania

Pamiętaj: dla zmian dotyczących IAM / Terraform / DynamoDB encryption koordynuj z `aws-infra`.
