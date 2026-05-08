```TypeScript
import { pooledMap } from "@std/async/pool";

// Your GraphQL fetcher (keep it simple)
async function graphql<T>(
  query: string,
  variables: Record<string, unknown>,
): Promise<T> {
  const res = await fetch("https://api.example.com/graphql", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  if (json.errors) throw new AggregateError(json.errors, "GraphQL errors");
  return json.data;
}

// The actual work
const queries = [/* array of 10k+ variable objects */];

const results = pooledMap(
  8, // tune this to your API's rate limit / server tolerance
  queries,
  (vars) => graphql<MyData>(QUERY, vars),
);

for await (const data of results) {
  // process each result as it arrives
  console.log(data);
}
```
