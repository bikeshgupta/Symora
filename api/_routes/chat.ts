/**
 * POST /api/chat — the "Ask Symora" pipeline entry point
 * (.claude/rules/ai-pipeline.md § Request flow). Every write goes through the typed
 * tool registry; nothing here executes SQL or arithmetic directly.
 */

import { z } from 'zod';
import {
  aiUsageRepository,
  buildTemporalAnchors,
  composeConfirmation,
  composeConversational,
  composeMissingDetails,
  composeSmallTalk,
  detectSmallTalk,
  composeToolResult,
  conversationsRepository,
  detectLanguage,
  getArgsSchema,
  getSupabaseServiceClient,
  INTENT_NAMES,
  isHighImpactIntent,
  categorizePastedText,
  decideTurn,
  extractIntentOffline,
  extractIntentResilient,
  DEGRADED_NO_INTENT_TEXT,
  QUOTA_EXHAUSTED_NO_INTENT_TEXT,
  getAiMode,
  usageService,
  memoryService,
  needsRelativeDateClarification,
  openAiProvider,
  truncateForExtraction,
  runTool,
  validateToolArgs,
  type ChatResponseBody,
  type TurnSource,
  type IntentName,
  type MessageRecord,
} from '@symora/core';
import { ApiError } from '../_middleware/errors';
import { withApiHandler } from '../_middleware/handler';

const requestSchema = z.object({
  conversationId: z.string().uuid().optional(),
  text: z.string().min(1).max(4000),
  /**
   * Where this turn came from. It only ever widens the confirmation gate — a voice turn
   * carrying a monetary amount always confirms — so a client that lies about it can make
   * Symora more cautious, never less (.claude/rules/ai-pipeline.md).
   */
  source: z.enum(['chat', 'voice']).default('chat'),
  confirm: z
    .object({
      intent: z.enum(INTENT_NAMES as [IntentName, ...IntentName[]]),
      args: z.unknown(),
    })
    .optional(),
});

function toMessageView(message: MessageRecord): ChatResponseBody['message'] {
  return {
    id: message.id,
    role: message.role,
    content: message.content,
    language: message.language,
    intent: (message.intent as IntentName | null) ?? null,
    createdAt: message.createdAt,
  };
}

export default withApiHandler(async (req, res, ctx) => {
  if (req.method !== 'POST') {
    throw new ApiError('METHOD_NOT_ALLOWED', `${req.method} is not allowed on /api/chat.`);
  }

  const parsedBody = requestSchema.safeParse(req.body);
  if (!parsedBody.success) {
    throw new ApiError('VALIDATION_ERROR', 'Invalid request body.');
  }
  const body = parsedBody.data;
  const client = getSupabaseServiceClient();

  // Resolve or create the conversation. A conversationId belonging to another user is
  // a 404, never leaking that it exists (.claude/rules/auth-security.md).
  let conversationId = body.conversationId;
  if (conversationId) {
    const existing = await conversationsRepository.getConversationById(client, ctx.user.id, conversationId);
    if (!existing) throw new ApiError('NOT_FOUND', 'Conversation not found.');
  } else {
    const created = await conversationsRepository.createConversation(client, ctx.user.id);
    conversationId = created.id;
  }

  const language = detectLanguage(body.text);
  const now = new Date();
  const source: TurnSource = body.source;
  // What the deployment is configured for. With no provider key the rule-based parser
  // stands in for the model. Every gate, tool and domain service below is identical
  // either way — only the extractor differs, which is what makes adding a key later a
  // configuration change and not a rewrite (packages/core/src/config/runtime-mode.ts).
  const configuredMode = getAiMode();

  // The month's allowance, enforced rather than merely reported.
  //
  // Phase 8 computed `exhausted` and left "the caller decides what to do about it" — and
  // no caller did, so AI_MONTHLY_REQUEST_ALLOWANCE showed a remaining count on the usage
  // screen and then changed nothing. Spending it now does what running with no key does:
  // the rule-based parser takes over and every deterministic feature is untouched. The
  // turn is answered either way; it is only understood less well, and the reply says so
  // rather than failing silently (.claude/rules/ai-pipeline.md § Provider and model use).
  const quota =
    configuredMode === 'ai'
      ? await usageService.getUsage(client, ctx.user.id, now, ctx.user.timezone, configuredMode)
      : null;
  const quotaExhausted = quota?.exhausted ?? false;
  if (quota?.exhausted) {
    ctx.logger.warn('AI allowance spent for the period; using the rule-based parser.', {
      period: quota.period,
      requests: quota.totals.requests,
      allowance: quota.allowance ?? undefined,
    });
  }
  const aiMode = quotaExhausted ? 'offline' : configuredMode;

  // Dates the model is allowed to use, computed here rather than by the model.
  const temporal = buildTemporalAnchors(now, ctx.user.timezone);
  const toolCtx = {
    client,
    userId: ctx.user.id,
    timezone: ctx.user.timezone,
    language,
    aiProvider: openAiProvider,
    now,
  };

  await conversationsRepository.createMessage(client, {
    userId: ctx.user.id,
    conversationId,
    role: 'user',
    content: body.text,
    language,
  });

  async function respond(text: string, ui: ChatResponseBody['ui'], intent: IntentName | null) {
    const assistantMessage = await conversationsRepository.createMessage(client, {
      userId: ctx.user.id,
      conversationId: conversationId!,
      role: 'assistant',
      content: text,
      intent,
    });
    const responseBody: { data: ChatResponseBody } = {
      data: { conversationId: conversationId!, message: toMessageView(assistantMessage), ui },
    };
    res.status(200).json(responseBody);
  }

  // -- Confirming a previously-returned proposal: execute directly, no re-extraction
  // (.claude/rules/ai-pipeline.md: "Confirming executes the already-parsed tool call;
  // it does not re-run extraction and risk a different result"). --
  if (body.confirm) {
    const argsSchema = getArgsSchema(body.confirm.intent);
    const parsedArgs = argsSchema.safeParse(body.confirm.args);
    if (!parsedArgs.success) {
      throw new ApiError('VALIDATION_ERROR', 'The confirmed action no longer looks valid.');
    }

    const result = await runTool(toolCtx, body.confirm.intent, body.confirm.args);
    const composed = composeToolResult(result);
    await respond(composed.text, composed.ui, body.confirm.intent);
    return;
  }

  // -- "Hello Symora." --
  //
  // A greeting is understood, not merely unmatched, so it gets an answer that says what
  // Symora can do rather than an apology for not understanding
  // (ai/orchestrator/small-talk.ts). It is checked before extraction because it writes
  // nothing and needs no model: the reply is the same whether a provider is configured,
  // unreachable, or absent, and it costs no tokens. Detection matches the whole message,
  // so "hi, remind me to call the doctor" is still a reminder.
  if (detectSmallTalk(body.text)) {
    // "hi" carries no language of its own, so a bare greeting is exactly the ambiguous
    // case .claude/rules/ai-pipeline.md § Language says to settle with preferred_language.
    // Anything the detector actually recognised — "नमस्ते", "kaise ho" — wins over it.
    const replyLanguage = language === 'en' ? ctx.user.preferredLanguage : language;
    const composed = composeSmallTalk(replyLanguage, ctx.user.displayName);
    await respond(composed.text, composed.ui, null);
    return;
  }

  // -- A fresh turn: load the memories relevant to it, then detect intent. --
  // Retrieval is deterministic and scoped to what this turn is about
  // (.claude/rules/ai-pipeline.md: never dump the user's whole memory into the prompt),
  // and only rows currently in effect are considered — a superseded fact must not
  // influence a new answer.
  // Only the model path can use retrieved memory — the rule parser matches patterns, not
  // context — so offline mode skips the query rather than paying for a result it will
  // discard. Memory itself is unaffected: it is still stored, listed, edited and deleted
  // exactly as before, it just does not inform offline extraction.
  const memories =
    aiMode === 'ai'
      ? await memoryService.retrieveRelevant(client, ctx.user.id, { text: body.text }, now, ctx.user.timezone)
      : [];

  // A configured provider that fails mid-turn falls back to the same rule parser that
  // serves offline mode rather than 500ing the request, and says so when it does
  // (ai/orchestrator/resilient-extraction.ts).
  const extraction =
    aiMode === 'offline'
      ? { ...extractIntentOffline(body.text, language, { temporal }), degraded: false }
      : await extractIntentResilient(openAiProvider, body.text, language, {
          memories,
          temporal,
          onProviderFailure: (error) =>
            ctx.logger.warn('AI provider failed; fell back to the rule-based parser.', {
              cause: error instanceof Error ? error.message : String(error),
            }),
        });

  // Recorded in both modes. An offline turn costs nothing and reports zero tokens, which
  // is exactly what the usage screen should show — a gap would look like lost data.
  await aiUsageRepository.recordAiUsage(client, {
    userId: ctx.user.id,
    provider: openAiProvider.name,
    model: extraction.model,
    intent: extraction.intent,
    promptTokens: extraction.usage.promptTokens,
    completionTokens: extraction.usage.completionTokens,
    totalTokens: extraction.usage.totalTokens,
    estimatedCostUsd: extraction.usage.estimatedCostUsd ?? null,
  });

  if (!extraction.intent) {
    const composed = composeConversational(
      quotaExhausted
        ? QUOTA_EXHAUSTED_NO_INTENT_TEXT
        : extraction.degraded
          ? DEGRADED_NO_INTENT_TEXT
          : (extraction.text ?? "I'm not sure I understood that."),
    );
    await respond(composed.text, composed.ui, null);
    return;
  }

  // interpret_pasted_message: the *proposed* action always needs confirmation, not the
  // interpretation step itself (.claude/rules/ai-pipeline.md — pasted content is
  // always high-impact, regardless of the nested extraction's own confidence).
  if (extraction.intent === 'interpret_pasted_message') {
    const rawPastedText = (extraction.args as { pastedText?: string } | null)?.pastedText ?? '';
    // Bound the second call's input: pasted content can be a whole email thread, and
    // only the top of it carries the signal.
    const pastedText = truncateForExtraction(rawPastedText);
    const pasteCategory = categorizePastedText(pastedText);
    // Re-retrieve against the pasted text itself: what is relevant to "here is a
    // message from my landlord" is rarely what is relevant to the message's contents.
    const pastedMemories =
      aiMode === 'ai'
        ? await memoryService.retrieveRelevant(
            client,
            ctx.user.id,
            { text: pastedText, intent: 'interpret_pasted_message' },
            now,
            ctx.user.timezone,
          )
        : [];
    const nested =
      aiMode === 'offline'
        ? { ...extractIntentOffline(pastedText, language, { temporal }), degraded: false }
        : await extractIntentResilient(openAiProvider, pastedText, language, {
            memories: pastedMemories,
            temporal,
            onProviderFailure: (error) =>
              ctx.logger.warn('AI provider failed on pasted text; fell back to the rule-based parser.', {
                cause: error instanceof Error ? error.message : String(error),
              }),
          });
    await aiUsageRepository.recordAiUsage(client, {
      userId: ctx.user.id,
      provider: openAiProvider.name,
      model: nested.model,
      intent: nested.intent,
      promptTokens: nested.usage.promptTokens,
      completionTokens: nested.usage.completionTokens,
      totalTokens: nested.usage.totalTokens,
      estimatedCostUsd: nested.usage.estimatedCostUsd ?? null,
    });

    const composed = nested.intent
      ? composeConfirmation(nested.intent, nested.args ?? {}, pasteCategory)
      : composeConversational(
          quotaExhausted
            ? QUOTA_EXHAUSTED_NO_INTENT_TEXT
            : nested.degraded
              ? DEGRADED_NO_INTENT_TEXT
              : (nested.text ?? "I looked at that text but couldn't identify an action to take."),
        );
    await respond(composed.text, composed.ui, nested.intent ?? 'interpret_pasted_message');
    return;
  }

  // Model output is untrusted input (.claude/rules/ai-pipeline.md § Output safety), so
  // the arguments are validated before anything decides what to do with them. A tool
  // call whose arguments fail its schema is a rejected tool call — asked about, never
  // coerced, never half-written, and never a 500 for a sentence the user may have got
  // perfectly right.
  const validation = validateToolArgs(extraction.intent, extraction.args ?? {});
  if (!validation.ok) {
    ctx.logger.warn('Rejected a tool call with invalid arguments.', {
      intent: extraction.intent,
      fields: validation.fields.join(','),
      degraded: extraction.degraded,
    });
    const composed = composeMissingDetails(validation.fields);
    await respond(composed.text, composed.ui, null);
    return;
  }

  // "kal" is both yesterday and tomorrow; when the tense does not settle which, asking
  // beats guessing — a confirmation card showing a date Symora picked invites the user
  // to skim past a wrong one.
  const unresolvedRelativeDate = needsRelativeDateClarification(body.text);

  const decision = decideTurn({
    confidence: extraction.confidence,
    isHighImpact: isHighImpactIntent(extraction.intent),
    source,
    args: extraction.args,
    hasUnresolvedRelativeDate: unresolvedRelativeDate,
  });

  if (decision === 'clarify') {
    const composed = composeConversational(
      unresolvedRelativeDate
        ? 'Just to be sure — did you mean yesterday or tomorrow?'
        : 'I want to make sure I get the details right — could you say that again with a bit more detail?',
    );
    await respond(composed.text, composed.ui, extraction.intent);
    return;
  }

  if (decision === 'confirm') {
    const composed = composeConfirmation(extraction.intent, extraction.args ?? {});
    await respond(composed.text, composed.ui, extraction.intent);
    return;
  }

  const result = await runTool(toolCtx, extraction.intent, extraction.args);
  const composed = composeToolResult(result);
  await respond(composed.text, composed.ui, extraction.intent);
});
