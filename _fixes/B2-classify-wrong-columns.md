# B2 — Classify writes to ft's old columns instead of our_ prefix

**Priority:** P1 — Critical **Status:** Overwrites ft's existing data, loses multi-label info

## Problem

classify.ts writes results to `primary_category`, `primary_domain`, and `classification_confidence`.
These are the FT CLI's original columns. The agreed plan uses `our_*` prefixed columns to avoid
collisions:

- `our_type TEXT` — JSON array of types (e.g. `["technique","tool"]`)
- `our_primary_type TEXT` — single best-fit (e.g. `"technique"`)
- `our_domains TEXT` — JSON array of domains
- `our_primary_domain TEXT` — single best-fit
- `our_classified_at TEXT` — ISO timestamp
- `our_confidence REAL` — 0.0-1.0

Currently classify.ts:

1. Overwrites ft's existing `primary_category` data (206 bookmarks already classified by ft)
2. Doesn't store multi-label arrays (plan says each bookmark can have multiple types/domains)
3. Doesn't record when classification happened
4. Writes `classification_confidence` instead of `our_confidence`

## Steps

### 1. Add `our_*` columns to DB

```sql
ALTER TABLE bookmarks ADD COLUMN our_type TEXT;
ALTER TABLE bookmarks ADD COLUMN our_primary_type TEXT;
ALTER TABLE bookmarks ADD COLUMN our_domains TEXT;
ALTER TABLE bookmarks ADD COLUMN our_primary_domain TEXT;
ALTER TABLE bookmarks ADD COLUMN our_classified_at TEXT;
ALTER TABLE bookmarks ADD COLUMN our_confidence REAL;
```

Handle "column already exists" — check with `PRAGMA table_info(bookmarks)` first.

### 2. Update `queryUnclassified` in classify.ts

Change the WHERE clause to use `our_primary_type` instead of `primary_category`:

```typescript
// BEFORE:
WHERE primary_category = 'unclassified' OR primary_category IS NULL

// AFTER:
WHERE our_primary_type IS NULL
```

### 3. Update `saveClassification` in classify.ts

Write to `our_*` columns + add timestamp:

```typescript
const saveClassification = (
  db: Database,
  tweetId: string,
  result: ClassificationResult,
) => {
  const now = new Date().toISOString();
  db.prepare(`
    UPDATE bookmarks SET
      our_type = ?,
      our_primary_type = ?,
      our_domains = ?,
      our_primary_domain = ?,
      our_classified_at = ?,
      our_confidence = ?
    WHERE tweet_id = ?
  `).run(
    JSON.stringify(result.types),
    result.primary_type,
    JSON.stringify(result.domains),
    result.primary_domain,
    now,
    result.confidence,
    tweetId,
  );
};
```

### 4. Update `markShortTweet` in classify.ts

```typescript
const markShortTweet = (db: Database, tweetId: string) => {
  const now = new Date().toISOString();
  db.prepare(`
    UPDATE bookmarks SET
      our_type = ?,
      our_primary_type = ?,
      our_domains = ?,
      our_primary_domain = ?,
      our_classified_at = ?,
      our_confidence = ?
    WHERE tweet_id = ?
  `).run(
    '["meme-shitpost"]',
    "meme-shitpost",
    '["culture"]',
    "culture",
    now,
    0.1,
    tweetId,
  );
};
```

### 5. Update `ClassificationResult` interface

Ensure it matches what parseLLMResponse returns and what saveClassification expects:

```typescript
interface ClassificationResult {
  types: string[]; // JSON array stored as-is
  primary_type: string; // single string
  domains: string[]; // JSON array stored as-is
  primary_domain: string; // single string
  confidence: number; // 0.0-1.0
}
```

### 6. Update `parseLLMResponse`

Validate that returned types/domains match our taxonomy. Currently falls back to "opinion" /
"culture" for invalid values. Keep that but also validate the array elements:

```typescript
const parseLLMResponse = (text: string): ClassificationResult => {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error(`No JSON in response: ${text.slice(0, 100)}`);

  const result = JSON.parse(jsonMatch[0]);

  // Validate and fallback for invalid values
  const types = Array.isArray(result.types) ? result.types : [result.primary_type];
  const domains = Array.isArray(result.domains) ? result.domains : [result.primary_domain];

  return {
    types: types.map((t: string) => TYPES.includes(t) ? t : null).filter(Boolean),
    primary_type: TYPES.includes(result.primary_type) ? result.primary_type : "opinion",
    domains: domains.map((d: string) => DOMAINS.includes(d) ? d : null).filter(Boolean),
    primary_domain: DOMAINS.includes(result.primary_domain) ? result.primary_domain : "culture",
    confidence: typeof result.confidence === "number"
      ? Math.min(1, Math.max(0, result.confidence))
      : 0.5,
  };
};
```

### 7. Verify

```bash
deno task classify --limit 10
sqlite3 ~/.ft-bookmarks/bookmarks.db "
  SELECT tweet_id, our_primary_type, our_primary_domain, our_confidence, our_classified_at
  FROM bookmarks
  WHERE our_primary_type IS NOT NULL
  LIMIT 5
"
# Should show our_* columns populated, primary_category untouched
```

## Acceptance Criteria

- [ ] `our_*` columns exist in DB
- [ ] classify.ts writes to `our_*` columns only
- [ ] `primary_category` and `primary_domain` (ft columns) are NOT touched
- [ ] Multi-label arrays stored as JSON in `our_type` and `our_domains`
- [ ] `our_classified_at` timestamp recorded per bookmark
- [ ] Old ft classifications (206 bookmarks) preserved in their original columns
