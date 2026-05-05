# B4 — Extract doesn't capture article images

**Priority:** P2 — Important **Status:** Article tweets lose embedded media

## Problem

When xtracticle returns an X Article, the article content has embedded images in:

- `tweet.article.cover_media.media_info.original_img_url` — cover image
- `tweet.article.media_entities[].media_info.original_img_url` — inline images

The extract command only processes `tweet.media.all` (direct tweet media like photos/videos attached
to the tweet itself). Article images are completely ignored — they don't get saved to the clipping
.md file.

Example: tweet 2042243910022406521 has:

- `tweet.media.all`: [] (empty — no direct media)
- `article.cover_media`: https://pbs.twimg.com/media/HFd9nS_WUAAu-Tl.jpg
- `article.media_entities`: https://pbs.twimg.com/media/HFd--C_XsAA1bJK.jpg

Both images are lost in the current clipping file.

## Steps

### 1. Add article image extraction function

In extract.ts, add a function to pull images from article structures:

```typescript
/** Extract image URLs from article content (cover + inline media_entities) */
const extractArticleImages = (tweet: XtracticleResponse["tweets"][0]): string[] => {
  const urls: string[] = [];

  // Cover image
  const coverUrl = tweet.article?.cover_media?.media_info?.original_img_url;
  if (coverUrl) urls.push(coverUrl);

  // Inline images from media_entities
  const mediaEntities = tweet.article?.media_entities;
  if (Array.isArray(mediaEntities)) {
    for (const entity of mediaEntities) {
      const url = entity?.media_info?.original_img_url;
      if (url && !urls.includes(url)) urls.push(url);
    }
  }

  return urls;
};
```

### 2. Update buildMediaList to include article images

Combine direct tweet media with article images:

```typescript
const buildMediaList = (
  media: XtracticleResponse["tweets"][0]["media"],
  articleImages: string[],
): string => {
  const lines: string[] = [];

  // Direct tweet media (photos, videos, GIFs)
  if (Array.isArray(media)) {
    for (const m of media) {
      if (m.type === "photo") {
        lines.push(`![image](${m.url})`);
      } else if (m.type === "video") {
        const thumb = m.thumbnail_url ? `![video thumbnail](${m.thumbnail_url})\n` : "";
        const bestFormat = m.formats?.length
          ? [...m.formats].sort((a, b) => (b.bitrate ?? 0) - (a.bitrate ?? 0))[0]
          : null;
        const videoUrl = bestFormat?.url || m.url;
        const duration = m.duration ? ` (${Math.round(m.duration)}s)` : "";
        lines.push(`${thumb}[▶ Watch video${duration}](${videoUrl})`);
      } else if (m.type === "animated_gif") {
        const thumb = m.thumbnail_url ? `![gif](${m.thumbnail_url})\n` : "";
        lines.push(`${thumb}[▶ View GIF](${m.url})`);
      }
    }
  }

  // Article images (cover + inline)
  for (const url of articleImages) {
    if (!lines.some((l) => l.includes(url))) { // Dedup
      lines.push(`![article image](${url})`);
    }
  }

  return lines.length ? lines.join("\n\n") : "";
};
```

### 3. Update buildClippingContent to pass article images

In buildClippingContent, extract article images and pass them through:

```typescript
const buildClippingContent = (
  tweet: XtracticleResponse["tweets"][0],
  type: string,
): string => {
  const text = getEffectiveText(tweet);
  const articleImages = extractArticleImages(tweet); // ← NEW
  const mediaList = buildMediaList(tweet.media, articleImages); // ← UPDATED

  // Extract article title if present
  const articleTitle = tweet.article && typeof tweet.article === "object"
    ? (tweet.article as Record<string, unknown>).title as string || null
    : null;

  return [
    buildFrontmatter(tweet, type),
    "",
    `# ${articleTitle || tweet.author.name}`,
    "",
    text,
    mediaList,
  ].join("\n");
};
```

### 4. Update buildFrontmatter to include article image count

Add article images to the frontmatter for metadata tracking:

```typescript
const buildFrontmatter = (
  tweet: XtracticleResponse["tweets"][0],
  type: string,
): string => {
  const lines = [
    "---",
    `type: ${type}`,
    `source: ${tweet.url}`,
    `tweet_id: ${tweet.id}`,
    `author: ${tweet.author.name} (@${tweet.author.screen_name})`,
    `date: ${tweet.created_at}`,
    `extracted_via: xtracticle`,
    `likes: ${tweet.likes}`,
    `bookmarks: ${tweet.bookmarks}`,
    `views: ${tweet.views}`,
  ];

  // Media types (direct + article)
  const directTypes = [...new Set((tweet.media?.all || []).map((m) => m.type))];
  const articleImages = extractArticleImages(tweet);
  const allTypes = [...directTypes];
  if (articleImages.length && !allTypes.includes("photo")) {
    allTypes.push("photo");
  }
  if (allTypes.length) {
    lines.push(`media_types: [${allTypes.join(", ")}]`);
  }

  if (tweet.article) {
    lines.push(`has_article: true`);
  }

  lines.push("---");
  return lines.join("\n");
};
```

### 5. Verify

```bash
# Re-extract a known article tweet (skip-existing to avoid duplicates)
deno task extract --limit 5

# Check the clipping file for image references
cat /home/dwarf/StoneVault/Clippings/X-Articles/*eptwts*.md | grep -c "pbs.twimg.com"
# Should show image URLs (cover + inline)

# Check a video-only tweet
cat /home/dwarf/StoneVault/Clippings/X-Media/*video*.md | grep -c "Watch video"
# Should show video links
```

## Acceptance Criteria

- [ ] `extractArticleImages()` pulls cover_media and media_entities URLs
- [ ] Article images included in clipping .md body as `![article image](url)`
- [ ] Direct tweet media and article images combined, deduplicated
- [ ] Frontmatter includes `has_article: true` flag for article tweets
- [ ] No duplicate image URLs in output
