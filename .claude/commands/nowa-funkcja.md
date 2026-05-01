---
description: Workflow dla nowej funkcji - od briefu do reviewu
argument-hint: "<krótki opis funkcji>"
---

Realizujemy nową funkcję: **$ARGUMENTS**

## 1. Brief
Zadaj 2-4 pytania doprecyzowujące jeśli opis jest niejasny:
- Co jest deliverable (UI? endpoint? infra change? wszystkie?)
- Edge cases / co MUSI działać
- Co jest poza scope tej iteracji

**Czekaj na odpowiedź właściciela.**

## 2. Plan
Wywołaj `architect` z briefem. Niech zaproponuje:
- Gdzie w strukturze idą zmiany (`apps/web`, `apps/api`, `packages/shared`, `infrastructure`)
- Czy potrzebny ADR
- Schemat danych (jeśli dotyczy)
- Granice z innymi modułami

Pokaż plan właścicielowi. **Czekaj na akceptację.**

## 3. Specjaliści (równolegle, jeśli plan tego wymaga)
- Funkcja dotyka **AWS / Terraform** → `aws-infra` planuje konkretne zmiany IaC
- Funkcja dotyka **auth / webhooks / upload / sekrety / IAM** → `security` daje wymagania
- Funkcja dotyka **Stravy / Garmina / GPX** → `integrator`
- Funkcja dotyka **UI / landingu** → `frontend-designer`

## 4. Implementacja
Sam (główny Claude) lub odpowiedni subagent:
- Mała, recenzowalna zmiana — jeśli funkcja jest duża, rozbij na PR-y
- Testy razem z kodem
- `.env.example` aktualny
- Nowe Terraform variables — opisane
- Dokumentacja inline gdzie złożona logika

## 5. Review
Wywołaj `reviewer` na diff. Zaaplikuj fixy.
- Jeśli były zmiany security-relevant → drugi przebieg `security` na finalnym kodzie
- Jeśli były zmiany w Terraformie → `aws-infra` confirm że plan jest czysty (`terraform plan`)

## 6. Commit
Tylko po LGTM. Konwencjonalny commit message. Branch `feat/<nazwa>`.

## 7. Deploy (jeśli dotyczy)
- Frontend → standardowy proces (Vercel / S3+CloudFront)
- Backend (Lambda) → build + Terraform apply
- **Terraform apply zawsze świadomie** — `aws-infra` pokazuje plan, właściciel akceptuje, dopiero apply
