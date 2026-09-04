import { z } from 'zod';

export type MemoryType = 'alias' | 'preference' | 'fact' | 'correction';
export type MemorySource = 'user_stated' | 'confirmed' | 'corrected';

export const MEMORY_TYPES: MemoryType[] = ['alias', 'preference', 'fact', 'correction'];

/**
 * Every V1 memory's value is a short piece of user-stated text. It is stored in a jsonb
 * column so richer shapes can arrive later without a migration, which means what comes
 * back out is untrusted and must be parsed, never cast
 * (.claude/rules/auth-security.md § Input and output safety).
 */
export const memoryValueSchema = z.object({ text: z.string().min(1) });
export type MemoryValue = z.infer<typeof memoryValueSchema>;

export interface MemoryRecord {
  id: string;
  userId: string;
  memoryType: MemoryType;
  key: string;
  valueJson: unknown;
  source: MemorySource;
  confidence: number;
  effectiveFrom: string;
  effectiveTo: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * The shape sent to the client for "What Symora knows about me". `text` is the parsed
 * value; a row whose value_json somehow does not match the schema degrades to an empty
 * string rather than throwing, so one malformed row cannot break the whole list.
 */
export interface MemoryView {
  id: string;
  memoryType: MemoryType;
  key: string;
  text: string;
  source: MemorySource;
  confidence: number;
  effectiveFrom: string;
  effectiveTo: string | null;
  isCurrent: boolean;
  createdAt: string;
  updatedAt: string;
}

export function readMemoryText(valueJson: unknown): string {
  const parsed = memoryValueSchema.safeParse(valueJson);
  return parsed.success ? parsed.data.text : '';
}
