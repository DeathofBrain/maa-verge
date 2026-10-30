type NumericToken = { source: string; value: number; float: boolean };
const numericTokens = new WeakMap<object, Map<string, NumericToken>>();

// Python distinguishes JSON integer tokens from floating-point tokens, even
// when their numeric values are equal. Keep that information outside the data.
export function parseWireJson(text: string): any {
  return JSON.parse(
    text,
    function (this: object, key: string, value: any, context?: { source?: string }) {
      if (typeof value === 'number' && context?.source !== undefined) {
        let tokens = numericTokens.get(this);
        if (!tokens) {
          tokens = new Map();
          numericTokens.set(this, tokens);
        }
        tokens.set(key, { source: context.source, value, float: /[.eE]/.test(context.source) });
      }
      return value;
    },
  );
}

export function wireNumberToken(
  container: object | undefined,
  key: string | number | undefined,
): Readonly<NumericToken> | undefined {
  if (container === undefined || key === undefined) return undefined;
  const token = numericTokens.get(container)?.get(String(key));
  // A caller may replace a property after parsing; provenance then no longer
  // describes its value. Do not apply an obsolete token to a changed number.
  return token && Object.is((container as any)[key], token.value) ? token : undefined;
}

export function isWireFloat(container: object, key: string | number): boolean {
  return wireNumberToken(container, key)?.float === true;
}

// Bun 1.4.3 implements JSON.rawJSON alongside reviver source contexts. Using
// the native serializer preserves its key order, array and toJSON semantics.
// Original numeric tokens keep Python's int/float distinction across restarts.
export function stringifyWireJson(value: unknown): string {
  const rawJSON = (JSON as typeof JSON & { rawJSON(source: string): unknown }).rawJSON;
  return JSON.stringify(value, function (this: object, key: string, item: any) {
    const token =
      typeof item === 'number' && Number.isFinite(item) ? wireNumberToken(this, key) : undefined;
    return token ? rawJSON(token.source) : item;
  });
}
