# Feature: Media Download

## What We Want (Your Requirements)

- Download media assets: tweet photos, video posters, capped videos, article images
- **Configurable storage path** via CLI or `config.ts` (media can get large)
- Default path: `~/.ft-bookmarks/media/`
- Optional skip for author profile images
- Per-asset size cap (default 200MB)
- Backfill missing media for existing bookmarks

## Source (fieldtheory-cli reference only)

- `ft sync`: Downloads media by default
- `ft sync --no-media`: Skip media
- `ft sync --media-max-bytes <n>`: Size cap
- `ft sync --skip-profile-images`: Skip profile pics
- `ft fetch-media`: Backfill missing media
- Implementation: `fetchBookmarkMediaBatch()` in `bookmark-media.ts`

## Porting Plan

1. **Config** (add to `config.ts` + `utils/bases.ts`):

```typescript
// config.ts
export const MEDIA_DIR = Deno.env.get("FT_MEDIA_DIR") ?? `${BASES.dataDir}/media`;
export const MEDIA_MAX_BYTES = parseInt(
  Deno.env.get("FT_MEDIA_MAX_BYTES") ?? "209715200", // 200MB
);
```

1. **Media Types to Handle**:
   - Direct tweet media: `tweet.media.all` (photo, video, animated_gif)
   - Article images: `article.cover_media` + `article.media_entities` (currently missing — B4 fix)
   - Profile images: author profile pics (optional skip)

2. **New Command**: `commands/fetch-media.ts`
   - `deno task fetch-media` → backfill all missing media
   - `deno task fetch-media --skip-profile-images`
   - Manifest tracking: `media-manifest.json` in media dir (track downloaded assets)

3. **Integration with Sync**:
   - Add flags to `types.ts` Command.Sync: `--no-media`, `--media-max-bytes`,
     `--skip-profile-images`
   - Run media fetch after sync (same as ft-cli)

4. **Storage Path (Critical)**:
   - User requirement: configurable because "media can get large"
   - Env var: `FT_MEDIA_DIR` (absolute path)
   - Fallback: `BASES.dataDir + '/media'`
   - Add to `BASES` object in `utils/bases.ts`

## Conventions

- Deno/TypeScript, use native `fetch()` for downloads (no Node.js `http`)
- Progress reporting via `stderr` (match existing pipeline logging)
- Manifest JSON: `{ asset_url: { path, size, downloaded_at } }`
- Always run `deno task ch:all` after edits
