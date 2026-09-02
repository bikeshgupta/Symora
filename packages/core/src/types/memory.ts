export type MemoryType = 'alias' | 'preference' | 'fact' | 'correction';
export type MemorySource = 'user_stated' | 'confirmed' | 'corrected';

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
