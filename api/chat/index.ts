/**
 * POST /api/chat — the "Ask Symora" pipeline entry point
 * (.claude/rules/ai-pipeline.md § Request flow). Every write goes through the typed
 * tool registry; nothing here executes SQL or arithmetic directly.
 */

import { z } from 'zod';
import {
  aiUsageRepository,
  composeConfirmation,
  composeConversational,
  composeToolResult,
  conversationsRepository,
  decide,
  detectLanguage,
  extractIntent,
  getArgsSchema,
  getSupabaseServiceClient,
  INTENT_NAMES,
  isHighImpactIntent,
  categorizePastedText,
  memoryService,
  openAiProvider,
  truncateForExtraction,
  runTool,
  type ChatResponseBody,
  type IntentName,
  type MessageRecord,
} from '@symora/core';
import { ApiError } from '../_middleware/errors';
import { withApiHandler } from '../_middleware/handler';

const requestSchema = z.object({
  conversationId: z.string().uuid().optional(),
  text: z.string().min(1).max(4000),
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

  // -- A fresh turn: load the memories relevant to it, then detect intent. --
  // Retrieval is deterministic and scoped to what this turn is about
  // (.claude/rules/ai-pipeline.md: never dump the user's whole memory into the prompt),
  // and only rows currently in effect are considered — a superseded fact must not
  // influence a new answer.
  const memories = await memoryService.retrieveRelevant(
    client,
    ctx.user.id,
    { text: body.text },
    now,
    ctx.user.timezone,
  );

  const extraction = await extractIntent(openAiProvider, body.text, language, { memories });
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
    const composed = composeConversational(extraction.text ?? "I'm not sure I understood that.");
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
    const pastedMemories = await memoryService.retrieveRelevant(
      client,
      ctx.user.id,
      { text: pastedText, intent: 'interpret_pasted_message' },
      now,
      ctx.user.timezone,
    );
    const nested = await extractIntent(openAiProvider, pastedText, language, { memories: pastedMemories });
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
          nested.text ??
            "I looked at that text but couldn't identify an action to take.",
        );
    await respond(composed.text, composed.ui, nested.intent ?? 'interpret_pasted_message');
    return;
  }

  const decision = decide(extraction.confidence, isHighImpactIntent(extraction.intent));

  if (decision === 'clarify') {
    const composed = composeConversational(
      'I want to make sure I get the details right — could you say that again with a bit more detail?',
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
