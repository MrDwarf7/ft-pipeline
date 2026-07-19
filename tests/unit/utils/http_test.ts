import { assertEquals, assertRejects, assertStringIncludes } from "@std/assert";
import { fetchWithRetry, parseRetryAfterMs, type RetryPolicy } from "../../../src/utils/http.ts";

const sleepNoop = (_ms: number): Promise<void> => Promise.resolve();

const basePolicy = (
  overrides: Partial<RetryPolicy> & Pick<RetryPolicy, "fetch">,
): RetryPolicy => ({
  maxAttempts: 3,
  baseDelayMs: 100,
  jitter: false,
  retryOn: [500, 502, 503],
  sleep: sleepNoop,
  ...overrides,
});

Deno.test("parseRetryAfterMs reads delay-seconds", () => {
  assertEquals(parseRetryAfterMs("2", 0), 2000);
  assertEquals(parseRetryAfterMs("0", 0), 0);
  assertEquals(parseRetryAfterMs(null, 0), null);
  assertEquals(parseRetryAfterMs("not-a-date", 0), null);
});

Deno.test("parseRetryAfterMs reads HTTP-date relative to nowMs", () => {
  const now = Date.parse("Wed, 21 Oct 2015 07:28:00 GMT");
  const later = "Wed, 21 Oct 2015 07:28:05 GMT";
  assertEquals(parseRetryAfterMs(later, now), 5000);
});

Deno.test("fetchWithRetry returns successful response without retry", async () => {
  let calls = 0;
  const fetch = (): Promise<Response> => {
    calls += 1;
    return Promise.resolve(new Response("ok", { status: 200 }));
  };

  const res = await fetchWithRetry(
    { input: "https://example.com/ok", init: undefined },
    basePolicy({ fetch }),
  );

  assertEquals(res.status, 200);
  assertEquals(await res.text(), "ok");
  assertEquals(calls, 1);
});

Deno.test("fetchWithRetry returns non-retryable 4xx without throwing", async () => {
  const fetch = (): Promise<Response> => Promise.resolve(new Response("missing", { status: 404 }));

  const res = await fetchWithRetry(
    { input: "https://example.com/missing", init: undefined },
    basePolicy({ fetch }),
  );

  assertEquals(res.status, 404);
});

Deno.test("fetchWithRetry honors Retry-After on 429 then succeeds", async () => {
  let calls = 0;
  const delays: number[] = [];
  const fetch = (): Promise<Response> => {
    calls += 1;
    if (calls === 1) {
      return Promise.resolve(
        new Response("slow down", {
          status: 429,
          headers: { "Retry-After": "2" },
        }),
      );
    }
    return Promise.resolve(new Response("ok", { status: 200 }));
  };

  const res = await fetchWithRetry(
    { input: "https://example.com/rate", init: undefined },
    basePolicy({
      fetch,
      sleep: (ms) => {
        delays.push(ms);
        return Promise.resolve();
      },
    }),
  );

  assertEquals(res.status, 200);
  assertEquals(calls, 2);
  assertEquals(delays, [2000]);
});

Deno.test("fetchWithRetry uses exponential backoff when 429 has no Retry-After", async () => {
  let calls = 0;
  const delays: number[] = [];
  const fetch = (): Promise<Response> => {
    calls += 1;
    if (calls < 3) {
      return Promise.resolve(new Response("rate", { status: 429 }));
    }
    return Promise.resolve(new Response("ok", { status: 200 }));
  };

  const res = await fetchWithRetry(
    { input: "https://example.com/backoff", init: undefined },
    basePolicy({
      maxAttempts: 3,
      baseDelayMs: 100,
      jitter: false,
      fetch,
      sleep: (ms) => {
        delays.push(ms);
        return Promise.resolve();
      },
    }),
  );

  assertEquals(res.status, 200);
  assertEquals(calls, 3);
  // attemptIndex 0 -> 100, attemptIndex 1 -> 200
  assertEquals(delays, [100, 200]);
});

Deno.test("fetchWithRetry retries statuses listed in retryOn", async () => {
  let calls = 0;
  const delays: number[] = [];
  const fetch = (): Promise<Response> => {
    calls += 1;
    if (calls === 1) {
      return Promise.resolve(new Response("boom", { status: 503 }));
    }
    return Promise.resolve(new Response("ok", { status: 200 }));
  };

  const res = await fetchWithRetry(
    { input: "https://example.com/5xx", init: undefined },
    basePolicy({
      baseDelayMs: 50,
      fetch,
      sleep: (ms) => {
        delays.push(ms);
        return Promise.resolve();
      },
    }),
  );

  assertEquals(res.status, 200);
  assertEquals(calls, 2);
  assertEquals(delays, [50]);
});

Deno.test("fetchWithRetry exhausts on persistent 429 with status and attempts", async () => {
  let calls = 0;
  const fetch = (): Promise<Response> => {
    calls += 1;
    return Promise.resolve(new Response("nope", { status: 429 }));
  };

  const err = await assertRejects(
    () =>
      fetchWithRetry(
        { input: "https://example.com/exhaust", init: undefined },
        basePolicy({ maxAttempts: 3, fetch }),
      ),
    Error,
  );

  assertEquals(calls, 3);
  assertStringIncludes(err.message, "3 attempt");
  assertStringIncludes(err.message, "HTTP 429");
  assertStringIncludes(err.message, "https://example.com/exhaust");
});

Deno.test("fetchWithRetry exhausts on persistent network errors", async () => {
  let calls = 0;
  const fetch = (): Promise<Response> => {
    calls += 1;
    return Promise.reject(new TypeError("connection reset"));
  };

  const err = await assertRejects(
    () =>
      fetchWithRetry(
        { input: "https://example.com/net", init: undefined },
        basePolicy({ maxAttempts: 2, fetch }),
      ),
    Error,
  );

  assertEquals(calls, 2);
  assertStringIncludes(err.message, "2 attempt");
  assertStringIncludes(err.message, "no HTTP status");
  assertStringIncludes(err.message, "connection reset");
});

Deno.test("fetchWithRetry rejects non-network errors immediately", async () => {
  let calls = 0;
  const fetch = (): Promise<Response> => {
    calls += 1;
    return Promise.reject(new Error("programmer error"));
  };

  await assertRejects(
    () =>
      fetchWithRetry(
        { input: "https://example.com/bug", init: undefined },
        basePolicy({ maxAttempts: 5, fetch }),
      ),
    Error,
    "programmer error",
  );
  assertEquals(calls, 1);
});

Deno.test("fetchWithRetry rejects maxAttempts < 1", async () => {
  await assertRejects(
    () =>
      fetchWithRetry(
        { input: "https://example.com", init: undefined },
        basePolicy({
          maxAttempts: 0,
          fetch: () => Promise.resolve(new Response("x")),
        }),
      ),
    Error,
    "maxAttempts must be >= 1",
  );
});
