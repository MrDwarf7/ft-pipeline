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
    const val = kv[2].trim();
    const cleanVal = val.startsWith('"') && val.endsWith('"') ? val.slice(1, -1) : val;
    return [kv[1].trim(), cleanVal];
  };

  return Object.fromEntries(
    match[1]
      .split("\n")
      .map(parseLine)
      .filter((entry): entry is [string, string] => entry !== null),
  );
};

export const extractBody = (content: string): string => {
  const match = content.match(/^---\n.*?\n---\n(.*)/s);
  return (match ? match[1] : content).trim();
};
