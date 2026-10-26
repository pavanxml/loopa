/**
 * Feed ranking — MVP scoring function, built to be improved later without
 * changing its shape. Each post gets a score from independently-computed
 * signals; swapping any one signal's implementation (e.g. replacing the
 * naive recency decay with a learned model, or engagement counts with a
 * real-time engagement-rate service) doesn't touch the others.
 *
 * score = w1*recency + w2*engagement + w3*affinity + w4*quality + w5*community
 */
export interface RankingSignals {
  ageHours: number;
  likeCount: number;
  commentCount: number;
  shareCount: number;
  authorIsFollowed: boolean;
  sameCommunityMembership: boolean;
  interestOverlapScore: number; // 0..1, overlap between post hashtags and user's UserInterest weights
  reportCount: number;
}

const WEIGHTS = {
  recency: 1.0,
  engagement: 1.4,
  affinity: 1.8,
  quality: 1.0,
  community: 0.8,
};

/** Logarithmic decay: a post's recency contribution roughly halves every ~10h. */
function recencyScore(ageHours: number): number {
  return 1 / Math.log2(ageHours + 2);
}

function engagementScore(s: RankingSignals): number {
  const raw = s.likeCount * 1 + s.commentCount * 2 + s.shareCount * 3;
  // Diminishing returns so a handful of viral posts can't dominate every slot.
  return Math.log10(raw + 1);
}

function qualityScore(s: RankingSignals): number {
  // Reports are a strong negative signal; a single report shouldn't nuke a
  // post, but several should push it down hard.
  return Math.max(0, 1 - s.reportCount * 0.35);
}

export function scorePost(s: RankingSignals): number {
  return (
    WEIGHTS.recency * recencyScore(s.ageHours) +
    WEIGHTS.engagement * engagementScore(s) +
    WEIGHTS.affinity * (s.authorIsFollowed ? 1 : 0.15 + s.interestOverlapScore * 0.5) +
    WEIGHTS.quality * qualityScore(s) +
    WEIGHTS.community * (s.sameCommunityMembership ? 1 : 0)
  );
}

export function rankPosts<T extends { signals: RankingSignals }>(posts: T[]): T[] {
  return [...posts].sort((a, b) => scorePost(b.signals) - scorePost(a.signals));
}
