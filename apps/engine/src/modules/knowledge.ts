import { one, many, none } from '../db/index.js';
import { currentBusinessId } from '../context.js';

// Structured brand knowledge base. All queries are scoped to the current
// business. Two access paths feed the AI: getPinnedForPrompt() (compact
// always-on summaries in the cached system block) and searchKnowledge() (full
// documents fetched on demand by the search_knowledge tool).

export type KnowledgeKind = 'policy' | 'guide' | 'brand' | 'faq' | 'other';
const KINDS: KnowledgeKind[] = ['policy', 'guide', 'brand', 'faq', 'other'];

export interface KnowledgeCollection {
  id: number;
  business_id: number;
  name: string;
  description: string;
  sort_order: number;
  created_at: number;
}

export interface KnowledgeDocument {
  id: number;
  business_id: number;
  collection_id: number | null;
  title: string;
  kind: KnowledgeKind;
  summary: string;
  content: string;
  keywords: string;
  pinned: number;
  active: number;
  created_at: number;
  updated_at: number;
}

/* ---------------------------------------------------------- collections */

export async function listCollections(): Promise<KnowledgeCollection[]> {
  return many<KnowledgeCollection>('SELECT * FROM knowledge_collections WHERE business_id = $1 ORDER BY sort_order, name', [currentBusinessId()]);
}

export async function getCollection(id: number): Promise<KnowledgeCollection | undefined> {
  return one<KnowledgeCollection>('SELECT * FROM knowledge_collections WHERE id = $1 AND business_id = $2', [id, currentBusinessId()]);
}

export async function createCollection(input: { name: string; description?: string; sort_order?: number }): Promise<KnowledgeCollection> {
  return (await one<KnowledgeCollection>(
    'INSERT INTO knowledge_collections (business_id, name, description, sort_order) VALUES ($1, $2, $3, $4) RETURNING *',
    [currentBusinessId(), input.name, input.description ?? '', input.sort_order ?? 0],
  ))!;
}

export async function updateCollection(id: number, patch: { name?: string; description?: string; sort_order?: number }): Promise<KnowledgeCollection | undefined> {
  const current = await getCollection(id);
  if (!current) return undefined;
  await none('UPDATE knowledge_collections SET name = $1, description = $2, sort_order = $3 WHERE id = $4 AND business_id = $5',
    [patch.name ?? current.name, patch.description ?? current.description, patch.sort_order ?? current.sort_order, id, current.business_id]);
  return getCollection(id);
}

// Deleting a collection keeps its documents (their collection_id is set NULL by
// the FK), so knowledge is never lost by reorganizing.
export async function deleteCollection(id: number): Promise<boolean> {
  if (!(await getCollection(id))) return false;
  await none('DELETE FROM knowledge_collections WHERE id = $1 AND business_id = $2', [id, currentBusinessId()]);
  return true;
}

/* ------------------------------------------------------------ documents */

export async function listDocuments(collectionId?: number): Promise<KnowledgeDocument[]> {
  if (collectionId !== undefined) {
    return many<KnowledgeDocument>('SELECT * FROM knowledge_documents WHERE business_id = $1 AND collection_id = $2 ORDER BY pinned DESC, title',
      [currentBusinessId(), collectionId]);
  }
  return many<KnowledgeDocument>('SELECT * FROM knowledge_documents WHERE business_id = $1 ORDER BY pinned DESC, title', [currentBusinessId()]);
}

export async function getDocument(id: number): Promise<KnowledgeDocument | undefined> {
  return one<KnowledgeDocument>('SELECT * FROM knowledge_documents WHERE id = $1 AND business_id = $2', [id, currentBusinessId()]);
}

export interface DocumentInput {
  title: string;
  kind?: KnowledgeKind;
  collection_id?: number | null;
  summary?: string;
  content?: string;
  keywords?: string;
  pinned?: boolean;
  active?: boolean;
}

const normalizeKind = (k?: KnowledgeKind): KnowledgeKind => (k && KINDS.includes(k) ? k : 'other');

export async function createDocument(input: DocumentInput): Promise<KnowledgeDocument> {
  return (await one<KnowledgeDocument>(`
    INSERT INTO knowledge_documents (business_id, collection_id, title, kind, summary, content, keywords, pinned, active)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING *
  `, [
    currentBusinessId(), input.collection_id ?? null, input.title, normalizeKind(input.kind),
    input.summary ?? '', input.content ?? '', input.keywords ?? '',
    input.pinned ? 1 : 0, input.active === false ? 0 : 1,
  ]))!;
}

export async function updateDocument(id: number, patch: Partial<DocumentInput>): Promise<KnowledgeDocument | undefined> {
  const current = await getDocument(id);
  if (!current) return undefined;
  await none(`
    UPDATE knowledge_documents SET collection_id = $1, title = $2, kind = $3, summary = $4, content = $5,
      keywords = $6, pinned = $7, active = $8, updated_at = (extract(epoch from now())::bigint)
    WHERE id = $9 AND business_id = $10
  `, [
    patch.collection_id === undefined ? current.collection_id : patch.collection_id,
    patch.title ?? current.title,
    patch.kind ? normalizeKind(patch.kind) : current.kind,
    patch.summary ?? current.summary,
    patch.content ?? current.content,
    patch.keywords ?? current.keywords,
    patch.pinned === undefined ? current.pinned : patch.pinned ? 1 : 0,
    patch.active === undefined ? current.active : patch.active ? 1 : 0,
    id, current.business_id,
  ]);
  return getDocument(id);
}

export async function deleteDocument(id: number): Promise<boolean> {
  if (!(await getDocument(id))) return false;
  await none('DELETE FROM knowledge_documents WHERE id = $1 AND business_id = $2', [id, currentBusinessId()]);
  return true;
}

/* ----------------------------------------------------------- retrieval */

// Compact always-on layer for the cached system prompt: pinned, active documents
// that have a summary. Title + summary only — full content stays out of the
// prompt and is pulled on demand by search_knowledge.
export async function getPinnedForPrompt(): Promise<{ title: string; summary: string }[]> {
  return many<{ title: string; summary: string }>(`
    SELECT title, summary FROM knowledge_documents
    WHERE business_id = $1 AND active = 1 AND pinned = 1 AND summary <> ''
    ORDER BY title
  `, [currentBusinessId()]);
}

// Keyword search over active documents, mirroring the search_catalog pattern.
// Returns full documents (title + content) so the AI can answer precisely.
export async function searchKnowledge(query: string, limit = 4): Promise<{ title: string; content: string }[]> {
  if (!query.trim()) return [];
  const q = `%${query.trim()}%`;
  return many<{ title: string; content: string }>(`
    SELECT title, content FROM knowledge_documents
    WHERE business_id = $1 AND active = 1
      AND (title ILIKE $2 OR summary ILIKE $2 OR content ILIKE $2 OR keywords ILIKE $2)
    ORDER BY pinned DESC, title
    LIMIT $3
  `, [currentBusinessId(), q, limit]);
}
