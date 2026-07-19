/** Shared frontmatter parser */

export interface Frontmatter {
  [key: string]: string;
}

export const parseFrontmatter = (content: string): Frontmatter => {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};

  const parseLine = (line: string): [string, string] | null => {
    const kv = line.match(/^(\w[\w_]*)\s*:\s*(.+)/);
    if (!kv) return null;
    const key = kv[1] ?? "";
    const raw = kv[2] ?? "";
    const val = raw.startsWith('"') && raw.endsWith('"') ? raw.slice(1, -1) : raw;
    return [key.trim(), val.trim()];
  };

  return Object.fromEntries(
    (match[1] ?? "")
      .split("\n")
      .map(parseLine)
      .filter((entry): entry is [string, string] => entry !== null),
  );
};

export const extractBody = (content: string): string => {
  const match = content.match(/^---\n.*?\n---\n(.*)/s);
  return (match ? (match[1] ?? content) : content).trim();
};
