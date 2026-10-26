export interface FeedPost {
  id: string;
  author: { username: string; displayName: string; avatarUrl: string | null };
  type: string;
  body: string | null;
  location: string | null;
  createdAt: string;
  media: { url: string; kind: string; thumbnailUrl: string | null }[];
  counts: { likes: number; comments: number; shares: number; saves: number };
  viewer: { liked: boolean; saved: boolean; isOwner?: boolean };
}
