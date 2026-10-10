/**
 * High-Performance In-Memory BM25 Search Engine with Fuzzy Typo-Tolerance
 * 
 * Features:
 * - Okapi BM25 Ranking Algorithm (k1=1.2, b=0.75)
 * - Inverted Index with Term Frequency & Document Frequency precomputations
 * - Sub-millisecond execution (O(1) postings lookup + score sorting)
 * - Levenshtein Distance typo tolerance with early pruning
 * - Stopword filtering and token normalization
 */

export interface IndexedDocument {
  id: string;
  title: string;
  content: string;
  category?: string;
  metadata?: Record<string, any>;
}

export interface SearchResult<T = IndexedDocument> {
  document: T;
  score: number;
  matchedTerms: string[];
}

const STOPWORDS = new Set([
  "a", "about", "above", "after", "again", "against", "all", "am", "an", "and", "any", "are",
  "as", "at", "be", "because", "been", "before", "being", "below", "between", "both", "but",
  "by", "could", "did", "do", "does", "doing", "down", "during", "each", "few", "for", "from",
  "further", "had", "has", "have", "having", "he", "her", "here", "hers", "herself", "him",
  "himself", "his", "how", "i", "if", "in", "into", "is", "it", "its", "itself", "just",
  "me", "more", "most", "my", "myself", "no", "nor", "not", "now", "of", "off", "on", "once",
  "only", "or", "other", "our", "ours", "ourselves", "out", "over", "own", "same", "she",
  "should", "so", "some", "such", "than", "that", "the", "their", "theirs", "them", "themselves",
  "then", "there", "these", "they", "this", "those", "through", "to", "too", "under", "until",
  "up", "very", "was", "we", "were", "what", "when", "where", "which", "while", "who", "whom",
  "why", "with", "would", "you", "your", "yours", "yourself", "yourselves"
]);

function tokenize(text: string): string[] {
  if (!text) return [];
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s_-]/g, " ")
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

/**
 * Fast Levenshtein distance with early-exit cutoff
 */
function levenshtein(a: string, b: string, maxDist: number = 2): number {
  if (Math.abs(a.length - b.length) > maxDist) return maxDist + 1;
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  let curr = new Array(b.length + 1);

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    let minInRow = curr[0];

    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        curr[j - 1] + 1,       // Insertion
        prev[j] + 1,           // Deletion
        prev[j - 1] + cost     // Substitution
      );
      if (curr[j] < minInRow) {
        minInRow = curr[j];
      }
    }

    if (minInRow > maxDist) {
      return maxDist + 1;
    }

    const temp = prev;
    prev = curr;
    curr = temp;
  }

  return prev[b.length];
}

export class BM25SearchIndex<T extends IndexedDocument = IndexedDocument> {
  private readonly documents = new Map<string, T>();
  private readonly docLengths = new Map<string, number>();
  // Inverted index: term -> Map<docId, termFrequency>
  private readonly postings = new Map<string, Map<string, number>>();
  private totalDocLength = 0;

  // BM25 Hyperparameters
  private readonly k1: number;
  private readonly b: number;

  constructor(k1 = 1.2, b = 0.75) {
    this.k1 = k1;
    this.b = b;
  }

  public get size(): number {
    return this.documents.size;
  }

  public addDocument(doc: T): void {
    if (this.documents.has(doc.id)) {
      this.removeDocument(doc.id);
    }

    this.documents.set(doc.id, doc);
    const tokens = tokenize(`${doc.title} ${doc.title} ${doc.content} ${doc.category || ""}`);
    const docLen = tokens.length || 1;

    this.docLengths.set(doc.id, docLen);
    this.totalDocLength += docLen;

    const termFreqs = new Map<string, number>();
    for (const t of tokens) {
      termFreqs.set(t, (termFreqs.get(t) || 0) + 1);
    }

    for (const [term, freq] of termFreqs.entries()) {
      let post = this.postings.get(term);
      if (!post) {
        post = new Map<string, number>();
        this.postings.set(term, post);
      }
      post.set(doc.id, freq);
    }
  }

  public addDocuments(docs: T[]): void {
    for (const doc of docs) {
      this.addDocument(doc);
    }
  }

  public removeDocument(id: string): void {
    if (!this.documents.has(id)) return;
    const oldLen = this.docLengths.get(id) || 0;
    this.totalDocLength = Math.max(0, this.totalDocLength - oldLen);
    this.documents.delete(id);
    this.docLengths.delete(id);

    for (const [, post] of this.postings.entries()) {
      post.delete(id);
    }
  }

  public clear(): void {
    this.documents.clear();
    this.docLengths.clear();
    this.postings.clear();
    this.totalDocLength = 0;
  }

  /**
   * Searches the index using BM25 ranking with typo expansion.
   */
  public search(query: string, limit: number = 20): SearchResult<T>[] {
    const rawTokens = tokenize(query);
    if (rawTokens.length === 0 || this.documents.size === 0) {
      return [];
    }

    const N = this.documents.size;
    const avgdl = this.totalDocLength / Math.max(1, N);

    // Expand search terms with fuzzy matching if direct match is sparse
    const expandedTerms = new Map<string, string[]>(); // queryToken -> matching index terms
    const allVocabulary = Array.from(this.postings.keys());

    for (const qToken of rawTokens) {
      const matches: string[] = [];
      if (this.postings.has(qToken)) {
        matches.push(qToken);
      } else {
        // Find fuzzy candidates if word is at least 4 letters
        if (qToken.length >= 4) {
          for (const vocab of allVocabulary) {
            if (levenshtein(qToken, vocab, 1) <= 1) {
              matches.push(vocab);
            }
          }
        }
      }
      expandedTerms.set(qToken, matches);
    }

    // Accumulate BM25 scores per document
    const docScores = new Map<string, { score: number; terms: Set<string> }>();

    for (const [qToken, terms] of expandedTerms.entries()) {
      for (const term of terms) {
        const post = this.postings.get(term);
        if (!post) continue;

        const df = post.size; // Document frequency
        // Standard Robertson-Spärck Jones IDF
        const idf = Math.log(1 + (N - df + 0.5) / (df + 0.5));

        for (const [docId, tf] of post.entries()) {
          const docLen = this.docLengths.get(docId) || avgdl;
          const numerator = tf * (this.k1 + 1);
          const denominator = tf + this.k1 * (1 - this.b + this.b * (docLen / avgdl));
          const termScore = idf * (numerator / denominator);

          // Apply small discount if matched via fuzzy typo
          const weight = term === qToken ? 1.0 : 0.75;
          const finalScore = termScore * weight;

          const existing = docScores.get(docId);
          if (existing) {
            existing.score += finalScore;
            existing.terms.add(term);
          } else {
            docScores.set(docId, { score: finalScore, terms: new Set([term]) });
          }
        }
      }
    }

    // Sort descending by score
    const results: SearchResult<T>[] = [];
    for (const [docId, data] of docScores.entries()) {
      const doc = this.documents.get(docId);
      if (doc) {
        results.push({
          document: doc,
          score: Math.round(data.score * 100) / 100,
          matchedTerms: Array.from(data.terms),
        });
      }
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, limit);
  }
}
