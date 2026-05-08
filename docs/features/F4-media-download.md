# F4 — Media Download

**Priority: P4 (after core in-housing)** **Goal: Download media assets (tweet photos, videos,
article images) to configurable path. Replace any ft-cli media download dependency.**

## Blake's Requirements

From `docs/feature-parity/media-download.md`:

- Download: tweet photos, video posters, capped videos, article images
- **Configurable storage path** via CLI or `config.ts` (media can get large)
- Default path: `~/.ft-bookmarks/media/`
- Optional skip for author profile images
- Per-asset size cap (default 200MB)
- Backfill missing media for existing bookmarks

## Source Reference (ft-cli)

From `fieldtheory-cli/src/bookmark-media.ts`:

- `fetchBookmarkMediaBatch()` function (port this logic)
- Media types: photos, videos, animated_gifs, article images, profile images

## Config Changes

Add to `src/utils/bases.ts`:

```typescript
export const BASES = {
  // ... existing
  mediaDir: Deno.env.get("FT_MEDIA_DIR") ?? `${dataDir}/media`,
};
```

Add to `src/config.ts`:

```typescript
export const CONFIG = {
  // ... existing
  mediaDir: envOrFallback("FT_MEDIA_DIR", BASES.mediaDir),
  mediaMaxBytes: parseInt(Deno.env.get("FT_MEDIA_MAX_BYTES") ?? "209715200"), // 200MB
};
```

Env vars:

- `FT_MEDIA_DIR` — absolute path for media storage (critical: media can get large)
- `FT_MEDIA_MAX_BYTES` — per-asset size cap (default 200MB)

## Media Types to Handle

From `extract.ts` + `media-download.md`:

1. **Direct tweet media**: `tweet.media.all` (photo, video, animated_gif)
2. **Article images**: `article.cover_media` + `article.media_entities` (B4 fix already done)
3. **Profile images**: author profile pics (optional skip)

## New Command: `commands/fetch-media.ts`

```typescript
// commands/fetch-media.ts
import { Database } from "@db/sqlite";
import { CONFIG } from "../config.ts";
import { logger } from "../utils/logger.ts";

export const runFetchMedia = async (options: {
  skipProfileImages?: boolean;
  backfill?: boolean;
}): Promise<void> => {
  logger.info("fetch-media started", options);

  const db = new Database(CONFIG.pipelineDbPath);

  // 1. Query bookmarks with media
  const rows = db.prepare(`
    SELECT tweet_id, media_json, author_profile_image_url
    FROM bookmarks
    WHERE media_count > 0 OR author_profile_image_url IS NOT NULL
  `).all<MediaRow>();

  // 2. Download each media asset
  for (const row of rows) {
    const media = JSON.parse(row.media_json ?? "[]");
    for (const m of media) {
      await downloadMedia(m.url, row.tweet_id);
    }

    if (!options.skipProfileImages && row.author_profile_image_url) {
      await downloadMedia(row.author_profile_image_url, row.tweet_id, "profile");
    }
  }

  logger.info("fetch-media complete");
};

const downloadMedia = async (url: string, tweetId: string, type = "media") => {
  // Check size cap
  const head = await fetch(url, { method: "HEAD" });
  const size = parseInt(head.headers.get("content-length") ?? "0");
  if (size > CONFIG.mediaMaxBytes) {
    logger.warn("skipping — too large", { url, size });
    return;
  }

  // Download
  const resp = await fetch(url);
  const path = `${CONFIG.mediaDir}/${tweetId}/${type}/${url.split("/").pop()}`;
  await Deno.mkdir(path.split("/").slice(0, -1).join("/"), { recursive: true });
  await Deno.writeFile(path, resp.body!);

  // Track in manifest
  await updateManifest(path, size);
};
```

## Manifest Tracking

Create `media-manifest.json` in `CONFIG.mediaDir`:

```json
{
  "asset_url_or_path": {
    "path": "absolute/path/to/file.jpg",
    "size": 12345,
    "downloaded_at": "2026-05-06T..."
  }
}
```

Checks manifest before downloading to avoid re-downloading.

## Integration with Sync

Add flags to `types.ts` `Command.Sync`:

- `--no-media`: Skip media download during sync
- `--media-max-bytes <n>`: Override size cap
- `--skip-profile-images`: Skip profile pics

In `commands/sync.ts`, after bookmark fetch:

```typescript
if (!options.noMedia) {
  await runFetchMedia({ skipProfileImages: options.skipProfileImages });
}
```

## CLI Tasks

```bash
deno task fetch-media                    # Backfill all missing media
deno task fetch-media --skip-profile-images  # Skip profile pics
deno task sync --no-media                # Skip media during sync
```

## Conventions Checklist

- [ ] Use native `fetch()` for downloads (no Node.js `http`)
- [ ] Progress reporting via `stderr` (match existing pipeline logging)
- [ ] Manifest JSON tracks downloaded assets
- [ ] Configurable path via `FT_MEDIA_DIR` (absolute path)
- [ ] Run `deno task ch:all` after every edit

## Success Criteria

- [ ] `deno task fetch-media` downloads missing media
- [ ] Media stored in configurable path (`FT_MEDIA_DIR`)
- [ ] Size cap enforced (default 200MB)
- [ ] Manifest tracks downloads (no re-downloads)
- [ ] `deno task sync --no-media` skips media
- [ ] `deno task ch:all` passes
