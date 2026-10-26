import { describe, it, expect } from "vitest";
import { scorePost, rankPosts, type RankingSignals } from "../src/lib/ranking";
import { usernameSchema, createPostSchema, extractHashtags } from "../src/lib/validation";
import { hashPassword, verifyPassword } from "../src/lib/password";

const base: RankingSignals = {
  ageHours: 5,
  likeCount: 10,
  commentCount: 2,
  shareCount: 1,
  authorIsFollowed: false,
  sameCommunityMembership: false,
  interestOverlapScore: 0,
  reportCount: 0,
};

describe("feed ranking", () => {
  it("ranks a followed author above an identical unfollowed one", () => {
    const followed = scorePost({ ...base, authorIsFollowed: true });
    const unfollowed = scorePost(base);
    expect(followed).toBeGreaterThan(unfollowed);
  });

  it("decays older posts", () => {
    expect(scorePost({ ...base, ageHours: 1 })).toBeGreaterThan(scorePost({ ...base, ageHours: 100 }));
  });

  it("penalizes reported content", () => {
    expect(scorePost({ ...base, reportCount: 4 })).toBeLessThan(scorePost(base));
  });

  it("is not purely chronological — engagement can outrank recency", () => {
    const oldButLoved = { signals: { ...base, ageHours: 20, likeCount: 5000, commentCount: 800 } };
    const newButIgnored = { signals: { ...base, ageHours: 1, likeCount: 0, commentCount: 0, shareCount: 0 } };
    const [first] = rankPosts([newButIgnored, oldButLoved]);
    expect(first).toBe(oldButLoved);
  });

  it("applies diminishing returns — each extra like adds less than the last", () => {
    // Marginal value of one more like at 10 likes vs at 10,000 likes.
    const marginalLow = scorePost({ ...base, likeCount: 11 }) - scorePost({ ...base, likeCount: 10 });
    const marginalHigh = scorePost({ ...base, likeCount: 10_001 }) - scorePost({ ...base, likeCount: 10_000 });
    expect(marginalHigh).toBeLessThan(marginalLow);
  });
});

describe("username validation", () => {
  it("accepts valid usernames", () => {
    expect(usernameSchema.safeParse("maya_r1").success).toBe(true);
  });
  it("rejects uppercase, spaces, and symbols", () => {
    for (const bad of ["Maya", "ma ya", "maya!", "ma"]) {
      expect(usernameSchema.safeParse(bad).success).toBe(false);
    }
  });
  it("rejects reserved names", () => {
    expect(usernameSchema.safeParse("admin").success).toBe(false);
    expect(usernameSchema.safeParse("loopa").success).toBe(false);
  });
  it("rejects all-numeric usernames", () => {
    expect(usernameSchema.safeParse("12345").success).toBe(false);
  });
});

describe("post validation", () => {
  it("requires body or media", () => {
    expect(createPostSchema.safeParse({ type: "text", mediaUrls: [] }).success).toBe(false);
  });
  it("requires poll data for poll posts", () => {
    expect(createPostSchema.safeParse({ type: "poll", body: "vote", mediaUrls: [] }).success).toBe(false);
  });
  it("accepts a valid text post", () => {
    expect(createPostSchema.safeParse({ type: "text", body: "hello loop", mediaUrls: [] }).success).toBe(true);
  });
  it("blocks hashtag spam", () => {
    const spammy = Array.from({ length: 15 }, (_, i) => `#tag${i}`).join(" ");
    expect(createPostSchema.safeParse({ type: "text", body: spammy, mediaUrls: [] }).success).toBe(false);
  });
});

describe("hashtag extraction", () => {
  it("extracts, lowercases, and dedupes", () => {
    expect(extractHashtags("Loving #Design and #design and #Rust")).toEqual(["design", "rust"]);
  });
  it("handles empty input", () => {
    expect(extractHashtags(null)).toEqual([]);
  });
});

describe("password hashing", () => {
  it("never stores plaintext and verifies correctly", async () => {
    const hash = await hashPassword("correct-horse-battery");
    expect(hash).not.toContain("correct-horse-battery");
    expect(await verifyPassword("correct-horse-battery", hash)).toBe(true);
    expect(await verifyPassword("wrong-password", hash)).toBe(false);
  });
});
