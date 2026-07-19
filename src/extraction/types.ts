/**
 * Shared types for extraction sources.
 */

export interface TweetData {
  id: string;
  text: string;
  author: { screen_name: string; name: string };
  created_at: string;
  media?: { all: MediaItem[] };
  article?: ArticleData;
  links_json?: string;
  engagement?: {
    likeCount: number;
    repostCount: number;
    replyCount: number;
    quoteCount: number;
    bookmarkCount: number;
    viewCount?: number;
  };
}

export interface MediaItem {
  type: string;
  url: string;
  original_img_url?: string;
  thumbnail_url?: string;
  duration?: number;
  formats?: Array<{ url: string; bitrate?: number }>;
}

export interface ArticleData {
  title?: string;
  preview_text?: string;
  content?: {
    blocks: Array<{ text?: string; type?: string }>;
    entityMap: Record<string, unknown>;
  };
  cover_media?: MediaItem;
  media_entities?: MediaItem[];
}
