
Symora — V1 Requirements & Architecture Blueprint

Purpose: single implementation reference. Build only V1 items now; future items should influence interfaces/data design but must not be implemented unless explicitly requested.

#Product goal
Symora V1 should prove one core behavior:

A user can tell, type, paste, or share something important; Symora understands it, stores it safely, remembers the right context, reminds the user, and helps them act.

#V1 scope
- Authentication and profile
- Ask Symora text interface
- Basic voice input
- English + Hindi + Hinglish
- Personal memory
- Commitments
- Tasks
- Reminders
- Basic finance obligations/payment tracking
- Paste-to-Symora
- Message drafting
- One-tap WhatsApp
- One-tap email
- Personalized home / Needs Attention
- Small controlled dynamic UI
- Basic notifications
- AI usage/quota tracking
- Privacy basics
- Export/delete basics
- Testing and production hardening

#Out of V1 / future scope
- Photo memory
- Travel gallery
- Full Gmail integration
- Calendar integration
- Automatic SMS reading
- Automatic WhatsApp sending
- Household/group accounts
- Live location
- Full financial advisory
- Complex generative UI
- Zero-knowledge Private Vault
- Native iOS/Android apps
- Advanced analytics
- Autonomous multi-agent workflows

#Estimated effort
Phase 1 — Foundation/Auth/DB: 10h
Phase 2 — Core chat + AI intent pipeline: 15h
Phase 3 — Personal memory: 12h
Phase 4 — Commitments + finance + tasks/reminders: 20h
Phase 5 — Paste/share + drafting + WhatsApp/email handoff: 10h
Phase 6 — Personalized home + small dynamic UI: 10h
Phase 7 — Voice + Hindi/Hinglish: 10h
Phase 8 — Notifications + quotas + privacy basics: 8h
Phase 9 — Testing/fixes/hardening: 15–25h

Total target: ~110–120h.

#Architecture principles
1. TypeScript end-to-end for V1.
2. AI understands language; backend owns truth.
3. Never allow AI-generated arbitrary SQL.
4. user_id is derived from verified authentication.
5. User A must never access User B.
6. Finance calculations are deterministic.
7. Memory is explicit and editable.
8. UI is rendered only from trusted components.
9. Future features remain behind interfaces/feature flags.
10. V1 should not require architectural rewrite for V2.

#Recommended V1 stack
Frontend:
- React
- TypeScript
- Vite
- PWA
- Tailwind CSS
- shadcn/ui
- Lucide
- TanStack Query
- Zod
- Recharts only when useful

Backend:
- Node.js
- TypeScript
- Vercel Functions/serverless APIs

Auth:
- Firebase Authentication
- Firebase Admin verification server-side

Database:
- Supabase PostgreSQL
- Supabase RLS

Storage:
- Supabase Storage only where needed

AI:
- OpenAI API initially
- provider abstraction
- structured outputs/tool calling
- cheap model for routine parsing/drafting
- stronger model only for complex cases

Voice:
- speech-to-text provider behind abstraction

Testing:
- Vitest
- Playwright
- integration tests
- authorization tests
- NLP regression corpus

#High-level V1 architecture
User
-> React PWA
-> Firebase Auth
-> Vercel Node API
-> AI Orchestrator + typed tool registry
-> Domain Services
   - Memory
   - Commitments
   - Finance
   - Tasks
   - Reminders
-> Supabase PostgreSQL
-> Notification/Usage services

Side adapters:
- AIProvider
- SpeechAdapter
- NotificationAdapter
- MessagingAdapter
- EmailAdapter
- StorageAdapter
- EncryptionAdapter (future implementation only)

Future connections:
- Native mobile apps
- WhatsApp Business
- Gmail/Calendar
- Private Vault
- Photo memory
- Household/group layer
- Advanced proactive agents

#Request-processing flow
User text / voice / pasted content
-> normalize + detect language
-> domain classifier
-> intent + entity extraction
-> load relevant context + memory
-> confidence/risk decision

If low confidence:
-> clarification

If high-impact write:
-> confirmation

Otherwise:
-> typed tool
-> deterministic domain service
-> database
-> structured result
-> response composer
-> trusted UI schema
-> React renderer

#Core V1 data model
users
- id
- firebase_uid
- email
- display_name
- timezone
- preferred_language
- created_at
- updated_at

memories
- id
- user_id
- memory_type
- key
- value_json
- source
- confidence
- effective_from
- effective_to
- created_at
- updated_at

commitments
- id
- user_id
- type: PAYMENT | TASK | REMINDER | IMPORTANT_DATE
- title
- description
- due_date
- due_time
- recurrence_rule
- status
- priority
- source
- created_at
- updated_at

financial_obligations
- id
- user_id
- commitment_id
- account_name
- obligation_type
- amount
- currency
- due_day
- recurrence_rule

financial_instances
- id
- user_id
- obligation_id
- period
- expected_amount
- paid_amount
- status
- paid_date

conversations
messages
ai_usage_events
notifications
audit_events

#Phase 1 — Foundation/Auth/DB — 10h
Build:
- repo structure
- React/Vite/TS
- Tailwind/shadcn
- PWA base
- Vercel setup
- Firebase Auth
- Firebase Admin server verification
- Supabase project/schema
- RLS
- server-only secrets
- API error contract
- logging convention
- feature flags
- migrations

Acceptance:
- Login works
- /api/me returns verified user
- User A cannot query User B
- Vercel deploy works
- migrations are versioned
- no server secret reaches frontend

#Phase 2 — Core Ask Symora + AI pipeline — 15h
Build:
- Ask Symora text input
- basic chat history
- AIProvider abstraction
- language detection
- domain routing
- intent/entity extraction
- confidence handling
- typed tool registry
- structured response format

Initial intents:
- create_commitment
- create_task
- create_reminder
- create_financial_obligation
- mark_paid
- mark_done
- reschedule
- list_pending
- calculate_monthly_requirement
- remember_preference
- draft_message
- interpret_pasted_message

Acceptance examples:
- “Home loan 42500 every month on 5th.”
- “Saturday electrician ko call karna.”
- “Remind me 2 days before every bill.”
- “This month what all is pending?”
- “Home loan kal pay kar diya.”

#Phase 3 — Personal memory — 12h
Build:
- explicit memory storage
- aliases
- preferences
- correction memory
- relevant-memory retrieval
- What Symora knows about me
- edit/delete memory
- effective-date support

Acceptance:
Learned information reduces repeated clarification.

#Phase 4 — Commitments + finance + tasks/reminders — 20h
Commitment umbrella:
- payments
- tasks
- reminders
- important dates

Finance V1:
- recurring obligations
- monthly instances
- due dates
- paid/pending
- amount/date
- monthly required total
- upcoming payments

Tasks:
- create
- due date/time
- priority
- status
- mark done
- reschedule

Reminders:
- one-time
- recurring
- lead-time preference

Important dates:
- birthdays
- anniversaries
- renewal dates

Acceptance:
- finance totals deterministic
- recurring definition separate from monthly history
- idempotent updates
- correct timezone handling

#Phase 5 — Paste/share + drafting + WhatsApp/email — 10h
Paste-to-Symora:
- payment confirmation
- appointment
- booking confirmation
- renewal message
- other useful text

Symora interprets and proposes an action.

Message drafting:
- generate 2 variants in one AI call
  - short
  - warm/detailed
- use known relationship/context when available

One-tap WhatsApp:
- wa.me link with prefilled text
- no WhatsApp Business API in V1

One-tap email:
- mailto prefill in V1

Share-to-Symora:
- design adapter/interface now
- native share extension later if required

#Phase 6 — Personalized home + small dynamic UI — 10h
Home:
- greeting
- Needs Attention
- upcoming payment
- today task
- important date
- overdue item
- contextual suggestions
- Ask Symora input

Trusted V1 UI components:
- AttentionCard
- PaymentSummary
- CommitmentList
- TaskList
- ConfirmationCard
- MessageDraftCard
- SuggestionChip

Avoid a generic dashboard.

#Phase 7 — Voice + Hindi/Hinglish — 10h
Build:
- push-to-talk
- speech-to-text
- raw transcript
- language detection
- Hindi/Hinglish interpretation
- confirmation for ambiguous sensitive values

Acceptance:
- “Kal wali EMI bhar diya.”
- “Saturday electrician ko call karna yaad dila dena.”
- “Agle 5 din me kitna payment baki hai?”

#Phase 8 — Notifications + usage + privacy basics — 8h
Notifications:
- due payment
- task
- birthday
- reminder

Usage:
- requests
- tokens
- estimated cost
- user allowance
- reset date

Privacy:
- view memories
- delete memory
- export data
- delete account
- clear data-access wording

Privacy principle:
“Symora knows what you intentionally tell, type, paste, or share.”

Do not automatically read SMS in V1.

#Phase 9 — Testing/hardening — 15–25h
Test:
- auth
- RLS
- cross-user access
- duplicate writes
- timezone
- recurring finance
- speech ambiguity
- Hindi/Hinglish
- malformed AI output
- provider timeout/failure
- network failure
- quota exhaustion
- notifications
- data deletion/export

Maintain an NLP regression corpus of messy real user phrases.

#Suggested V1 API groups
- /api/me
- /api/chat
- /api/memories
- /api/commitments
- /api/tasks
- /api/reminders
- /api/finance
- /api/drafts
- /api/notifications
- /api/usage
- /api/privacy/export
- /api/privacy/delete

#Day-1 architecture checklist
Repository:
- Git repo
- lint/format/typecheck
- environment template
- README
- architecture folder
- migrations folder

Vercel:
- project
- production env
- preview env
- secrets

Firebase:
- project
- Google/email auth
- frontend config
- Firebase Admin server config

Supabase:
- project
- migrations
- users/profile
- RLS
- service-role server only
- dev strategy

Backend:
- auth middleware
- request context
- error contract
- logger
- repository pattern
- domain-service pattern

AI:
- AIProvider interface
- OpenAI implementation
- structured output types
- typed tool registry
- usage metering hook

Create interfaces now, even if implementation comes later:
- AIProvider
- SpeechAdapter
- NotificationAdapter
- MessagingAdapter
- EmailAdapter
- StorageAdapter
- EncryptionAdapter
- CalendarAdapter

#Version 2 — planned future scope
Build only after V1 usage is validated:
- zero-knowledge Private Vault
- richer notes
- Gmail integration
- Calendar integration
- WhatsApp Business integration if justified
- native Android/iOS
- native Share Sheet integration
- richer proactive suggestions
- richer dynamic UI
- household/family shared context
- advanced finance history
- monetization/storage plans
- multi-provider AI routing

#Version 3+
Possible:
- photo/travel memory
- image understanding
- family/group planning
- live location
- advanced personal knowledge graph
- autonomous workflows with confirmation
- personal document understanding
- long-term historical insights
- native secure vault
- more integrations
- business variants

#Private Vault — future architecture only
Do not implement in V1.

Future:
User
-> device-generated master key
-> local encryption
-> encrypted ciphertext uploaded
-> server stores ciphertext only

Recovery:
- Recovery Kit
- QR
- explicit warning that Symora cannot recover without key/trusted device

Prefer:
AI interprets intent
-> local deterministic execution over decrypted data

#Future photo memory
Not V1.

Later:
- private object storage
- compression
- thumbnails
- EXIF extraction
- metadata separate from image bytes
- storage quota
- paid plans
- export
- grace period after downgrade
- deletion policy

#V1 Definition of Done
A private-test user can:
1. Log in.
2. Tell Symora a recurring payment.
3. Add a task/reminder naturally.
4. Use English/Hindi/Hinglish.
5. Return later and have Symora remember important context.
6. Ask what is pending.
7. Mark payments/tasks complete.
8. Paste a payment message and let Symora interpret it.
9. Draft a message.
10. Open that draft directly in WhatsApp/email.
11. Receive basic reminders.
12. See what Symora knows about them.
13. Edit/delete memories.
14. Export/delete account data.
15. Never access another user's records.

#Final instruction to coding models
Build only items explicitly marked V1.
Future items may influence interface boundaries and data design, but must not be implemented unless specifically requested.
Do not add future features merely because they appear in this document.
Keep the code modular so future adapters can be added without rewriting the core domain layer.