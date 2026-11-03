import { readdirSync, realpathSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

export const normalized = (file) => file.split(path.sep).join('/');
export function identity(file) {
  let resolved = path.resolve(file);
  try {
    resolved = realpathSync.native(resolved);
  } catch {
    // Missing sources still participate in boundary checks; tsc reports existence.
  }
  return ts.sys.useCaseSensitiveFileNames ? resolved : resolved.toLowerCase();
}

export function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name))
    .flatMap((entry) => {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) return sourceFiles(file);
      return entry.isFile() ? [file] : [];
    });
}

export function moduleReferences(source) {
  const references = [];
  const add = (literal) => {
    if (literal && ts.isStringLiteralLike(literal))
      references.push({
        specifier: literal.text,
        line: source.getLineAndCharacterOfPosition(literal.getStart(source)).line + 1,
      });
  };
  const visit = (node) => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) add(node.moduleSpecifier);
    else if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference)
    )
      add(node.moduleReference.expression);
    else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument))
      add(node.argument.literal);
    else if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === 'require'))
    )
      add(node.arguments[0]);
    ts.forEachChild(node, visit);
  };
  visit(source);
  return references;
}

export function compilerOptions(sourceRoot) {
  const defaults = {
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    allowJs: true,
    resolveJsonModule: true,
  };
  const file = ts.findConfigFile(sourceRoot, ts.sys.fileExists, 'tsconfig.json');
  if (!file) return defaults;
  const config = ts.readConfigFile(file, ts.sys.readFile);
  if (config.error)
    throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, '\n'));
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, path.dirname(file));
  if (parsed.errors.length)
    throw new Error(
      parsed.errors
        .map((error) => ts.flattenDiagnosticMessageText(error.messageText, '\n'))
        .join('\n'),
    );
  return { ...defaults, ...parsed.options };
}

export function referenceTarget(specifier, file, options, cache) {
  const resolved = ts.resolveModuleName(specifier, file, options, ts.sys, cache).resolvedModule
    ?.resolvedFileName;
  return (
    resolved ??
    (specifier.startsWith('.') || path.isAbsolute(specifier)
      ? path.resolve(path.dirname(file), specifier)
      : undefined)
  );
}
