export class JsonParseError extends Error {}

function lineColumn(text: string, index: number): { line: number; column: number } {
  const lines = text.slice(0, index).split("\n");
  return { line: lines.length, column: (lines.at(-1) ?? "").length + 1 };
}

/**
 * JSON.parse with readable errors. V8 only sometimes reports a position, so line and
 * column are computed here, and the echoed input is stripped from the message.
 */
export function parseJson(text: string): unknown {
  if (text.trim() === "") throw new JsonParseError("Input is empty.");
  try {
    return JSON.parse(text);
  } catch (error) {
    const raw = (error as Error).message;
    const reason = raw
      .replace(/ in JSON at position \d+.*$/s, "")
      .replace(/, ".*" is not valid JSON$/s, "");
    const position = /at position (\d+)/.exec(raw);
    if (!position) throw new JsonParseError(reason);
    const { line, column } = lineColumn(text, Number(position[1]));
    throw new JsonParseError(`line ${line}, column ${column}: ${reason}`);
  }
}

export function formatJson(value: unknown, indent: number, minify = false): string {
  return JSON.stringify(value, null, minify ? 0 : indent);
}
