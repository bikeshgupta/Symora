
SYMORA ARCHITECTURE — V1 VS FUTURE

[V1 — BUILD NOW]

User
  |
  v
React + TypeScript PWA
  |
  +--> Firebase Authentication
  |
  v
Vercel Node/TypeScript API
  |
  +--> AI Orchestrator
  |      |
  |      +--> AIProvider (OpenAI implementation in V1)
  |      +--> Intent / Entity Extraction
  |      +--> Context + Memory Resolver
  |      +--> Typed Tool Registry
  |
  +--> Domain Services
  |      |
  |      +--> Memory
  |      +--> Commitments
  |      +--> Finance
  |      +--> Tasks
  |      +--> Reminders
  |      +--> Drafting
  |
  +--> SpeechAdapter
  |
  +--> NotificationAdapter
  |
  +--> Usage Metering
  |
  v
Supabase PostgreSQL
  |
  +--> RLS
  +--> User-scoped records
  +--> Audit events


[REQUEST FLOW]

Text / Voice / Pasted Content
  |
  v
Normalize + Detect Language
  |
  v
Domain Classifier
  |
  v
Intent + Entity Extraction
  |
  v
Relevant Context + Personal Memory
  |
  v
Confidence / Risk Check
  |
  +--> Clarification required
  +--> Confirmation required
  |
  v
Typed Tool
  |
  v
Deterministic Domain Service
  |
  v
Database
  |
  v
Structured Result
  |
  +--> Natural Response
  +--> Trusted UI Schema
  |
  v
React Renderer


[FUTURE — DESIGN FOR, DO NOT BUILD NOW]

Vercel API / Core Domain Layer
  |
  +-.-> Native Android/iOS
  +-.-> WhatsApp Business Platform
  +-.-> Gmail / Calendar Connectors
  +-.-> Private Vault / Zero-Knowledge Encryption
  +-.-> Photo Memory
  +-.-> Household / Group Layer
  +-.-> Advanced Proactive Agents
  +-.-> Multi-provider AI Routing
  +-.-> Native Share Sheet


[ADAPTER INTERFACES TO CREATE IN V1]

AIProvider
SpeechAdapter
NotificationAdapter
MessagingAdapter
EmailAdapter
CalendarAdapter
StorageAdapter
EncryptionAdapter

Only required implementations should be active in V1.
Future adapters should remain interfaces/placeholders until explicitly requested.
