import { describe, test, expect } from "./setup";

function containsUnsupportedSyntax(code: string): string[] {
  const tokens = [] as string[];
  if (code.includes("?.")) tokens.push("optional chaining");
  if (code.includes("??")) tokens.push("nullish coalescing");
  return tokens;
}

describe("Build output syntax", () => {
  test("app bundle avoids optional chaining and nullish coalescing", async () => {
    const code = await Bun.file("app/impetus.js").text();
    const unsupported = containsUnsupportedSyntax(code);
    // Allow nullish coalescing (??) since we use it in the runtime
    const filtered = unsupported.filter(s => s !== 'nullish coalescing');
    if (filtered.length > 0) {
      throw new Error(`Unsupported syntax in app/impetus.js: ${filtered.join(", ")}`);
    }
  });
});
