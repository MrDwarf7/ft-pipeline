/** Shared types for index page generation. */

/** One classified bookmark used when building index pages. */
export interface BookmarkEntry {
  tweet_id: string;
  text: string;
  display_text: string;
  author_handle: string;
  author_name: string;
  posted_at: string;
  primary_type: string;
  primary_domain: string;
  likes: number;
}

/** Whether a bookmark line links to categories/ or domains/. */
export type LinkType = "category" | "domain";

/** A headed block of markdown body text. */
export interface PageSection {
  heading: string;
  body: string;
}

/** Grouped bookmarks for category, domain, and entity pages. */
export interface IndexGroups {
  byCategory: Record<string, BookmarkEntry[]>;
  byDomain: Record<string, BookmarkEntry[]>;
  byAuthor: Record<string, BookmarkEntry[]>;
}
