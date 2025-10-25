export const BOOLEAN_ATTRS = new Set([
  "checked","disabled","readonly","required","open","selected","hidden",
  "autofocus","multiple","muted","playsinline","controls"
]);

export const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "TEMPLATE"]);

export const DIRECTIVES = {
  IF: new Set(['s-if', '@if']),
  SHOW: new Set(['s-show', '@show']),
  ELSE: new Set(['s-else', '@else']),
  EACH: new Set(['s-each', '@each']),
  TRANSITION: new Set(['s-transition', '@transition'])
} as const;

export const PLACEHOLDERS = {
  LBRACE: "\u0000LBRACE\u0000",
  RBRACE: "\u0000RBRACE\u0000"
} as const;
