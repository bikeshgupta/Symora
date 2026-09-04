/**
 * POST /api/drafts — draft a message and hand it off (PROGRESS.md Phase 5).
 *
 * Both variants come back from a single AI call (.claude/rules/ai-pipeline.md § Provider
 * and model use), each with its own WhatsApp and mailto link. Nothing is sent: Symora
 * builds the link, the user reviews the prefilled text in WhatsApp or their mail client
 * and presses send themselves. There is no `drafts` table in the V1 data model, so
 * nothing here is persisted either — only the AI usage event, which every provider call
 * records.
 */

import { z } from 'zod';
import {
  aiUsageRepository,
  buildMemoryContext,
  detectLanguage,
  draftMessage,
  draftMessageOffline,
  getAiMode,
  getSupabaseServiceClient,
  memoryService,
  openAiProvider,
  withHandoff,
  type ApiSuccessBody,
  type DraftVariantWithHandoff,
} from '@symora/core';
import { ApiError } from '../_middleware/errors';
import { withApiHandler } from '../_middleware/handler';

const requestSchema = z.object({
  context: z.string().min(1).max(2000).describe('What the message needs to say.'),
  recipientRelationship: z.string().max(120).optional(),
  recipientPhone: z.string().max(32).optional(),
  recipientEmail: z.string().email().max(320).optional(),
  subject: z.string().max(200).optional(),
});

export interface DraftResponseBody {
  variants: DraftVariantWithHandoff[];
  language: 'en' | 'hi' | 'hinglish';
  /** True when these came from a template rather than a model, so the UI can say so. */
  templated: boolean;
}

export default withApiHandler(async (req, res, ctx) => {
  if (req.method !== 'POST') {
    throw new ApiError('METHOD_NOT_ALLOWED', `${req.method} is not allowed on /api/drafts.`);
  }

  const parsed = requestSchema.safeParse(req.body);
  if (!parsed.success) throw new ApiError('VALIDATION_ERROR', 'Tell Symora what the message should say.');

  const client = getSupabaseServiceClient();
  const now = new Date();
  const language = detectLanguage(parsed.data.context);
  const aiMode = getAiMode();

  // What Symora already knows about the recipient sets the tone — that a landlord is
  // formal, that "mummy" is Sunita. Retrieval is scoped to this request, as everywhere.
  // Offline mode fills a template instead of writing prose. Both produce the same two
  // variants and the same handoff links, so the card and the WhatsApp/email flow are
  // unchanged — the drafts are just plainer, and the UI says so.
  const memories =
    aiMode === 'ai'
      ? await memoryService.retrieveRelevant(
          client,
          ctx.user.id,
          {
            text: `${parsed.data.context} ${parsed.data.recipientRelationship ?? ''}`,
            intent: 'draft_message',
          },
          now,
          ctx.user.timezone,
        )
      : [];

  const draftArgs = {
    context: parsed.data.context,
    recipientRelationship: parsed.data.recipientRelationship,
  };

  const draft =
    aiMode === 'offline'
      ? draftMessageOffline(draftArgs, language)
      : await draftMessage(openAiProvider, draftArgs, language, {
          memoryContext: buildMemoryContext(memories),
        });

  await aiUsageRepository.recordAiUsage(client, {
    userId: ctx.user.id,
    provider: openAiProvider.name,
    model: draft.model,
    intent: 'draft_message',
    promptTokens: draft.usage.promptTokens,
    completionTokens: draft.usage.completionTokens,
    totalTokens: draft.usage.totalTokens,
    estimatedCostUsd: draft.usage.estimatedCostUsd ?? null,
  });

  const body: ApiSuccessBody<DraftResponseBody> = {
    data: {
      language,
      templated: aiMode === 'offline',
      variants: withHandoff(draft, {
        phone: parsed.data.recipientPhone,
        email: parsed.data.recipientEmail,
        subject: parsed.data.subject,
      }),
    },
  };
  res.status(200).json(body);
});
