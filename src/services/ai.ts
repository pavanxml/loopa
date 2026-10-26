/**
 * LOOPA AI — provider-agnostic interface (Phase 7 in the roadmap).
 *
 * Nothing in the frontend ever calls a model provider directly, and no
 * API key for any provider is ever sent to the client — every AI feature
 * routes through a server-side route handler that calls `aiService`.
 *
 * This stub implementation is heuristic-only (no external calls) so the
 * app has *something real* behind these endpoints today. Swap it for an
 * implementation that calls your provider of choice (Anthropic, OpenAI,
 * a self-hosted model, ...) by implementing the same interface and
 * changing the export at the bottom — nothing else in the app changes.
 * The provider's API key lives in an env var read only on the server
 * (see .env.example → AI_PROVIDER_API_KEY), never bundled into client JS.
 */
export interface AiService {
  suggestHashtags(body: string): Promise<string[]>;
  suggestCaption(context: string): Promise<string>;
  summarizeDiscussion(comments: string[]): Promise<string>;
  moderateText(text: string): Promise<{ flagged: boolean; reasons: string[] }>;
}

const SPAM_MARKERS = ["click here", "free money", "guaranteed win", "buy now!!!"];

class HeuristicAiService implements AiService {
  async suggestHashtags(body: string): Promise<string[]> {
    const words = body
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 4);
    const freq = new Map<string, number>();
    for (const w of words) freq.set(w, (freq.get(w) ?? 0) + 1);
    return Array.from(freq.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([w]) => `#${w}`);
  }

  async suggestCaption(context: string): Promise<string> {
    const trimmed = context.trim();
    if (!trimmed) return "Share what's on your mind…";
    return `${trimmed.slice(0, 120)}${trimmed.length > 120 ? "…" : ""}`;
  }

  async summarizeDiscussion(comments: string[]): Promise<string> {
    if (comments.length === 0) return "No discussion yet.";
    return `${comments.length} comments — most recent themes: ${comments
      .slice(-3)
      .map((c) => c.slice(0, 40))
      .join(" · ")}`;
  }

  async moderateText(text: string): Promise<{ flagged: boolean; reasons: string[] }> {
    const lower = text.toLowerCase();
    const reasons = SPAM_MARKERS.filter((m) => lower.includes(m));
    return { flagged: reasons.length > 0, reasons };
  }
}

export const aiService: AiService = new HeuristicAiService();
