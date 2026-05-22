import { Project, SyntaxKind, Node } from "ts-morph";
import * as path from "path";
import * as fs from "fs";

async function main() {
  const project = new Project({
    tsConfigFilePath: path.join(process.cwd(), "tsconfig.json"),
  });

  const sourceFiles = project.getSourceFiles();
  let modifiedCount = 0;

  for (const sourceFile of sourceFiles) {
    let changed = false;

    // 1. Replace (x as Error).message with errorMessage(x)
    const asExpressions = sourceFile.getDescendantsOfKind(SyntaxKind.AsExpression);
    for (const asExpr of asExpressions) {
      if (asExpr.getTypeNode()?.getText() === "Error") {
        const parent = asExpr.getParent();
        if (Node.isParenthesizedExpression(parent)) {
          const grandParent = parent.getParent();
          if (Node.isPropertyAccessExpression(grandParent) && grandParent.getName() === "message") {
            const expr = asExpr.getExpression().getText();
            grandParent.replaceWithText(`errorMessage(${expr})`);
            changed = true;
            
            const utilImport = sourceFile.getImportDeclaration(decl => decl.getModuleSpecifierValue().includes("utilities.ts") || decl.getModuleSpecifierValue() === "../utilities.ts" || decl.getModuleSpecifierValue() === "../../utilities.ts");
            if (utilImport) {
                if (!utilImport.getNamedImports().some(ni => ni.getName() === "errorMessage")) {
                    utilImport.addNamedImport("errorMessage");
                }
            } else {
                const relativePath = path.relative(sourceFile.getDirectoryPath(), path.join(process.cwd(), "src", "utilities.ts"));
                let importPath = relativePath.startsWith(".") ? relativePath : "./" + relativePath;
                if (!importPath.endsWith(".ts")) importPath += ".ts";
                sourceFile.addImportDeclaration({
                    namedImports: ["errorMessage"],
                    moduleSpecifier: importPath.replace(/\\/g, "/")
                });
            }
          }
        }
      }
    }

    // 2. Find and fix catch (error: any) -> catch (error: unknown)
    const catchClauses = sourceFile.getDescendantsOfKind(SyntaxKind.CatchClause);
    for (const catchClause of catchClauses) {
      const variable = catchClause.getVariableDeclaration();
      if (variable) {
        const typeNode = variable.getTypeNode();
        if (typeNode && typeNode.getText() === "any") {
          typeNode.replaceWithText("unknown");
          changed = true;
        }
      }
    }

    // 3. Find Record<string, any> and replace with Record<string, unknown>
    const typeReferences = sourceFile.getDescendantsOfKind(SyntaxKind.TypeReference);
    for (const typeRef of typeReferences) {
      if (typeRef.getTypeName().getText() === "Record") {
        const typeArgs = typeRef.getTypeArguments();
        if (typeArgs.length === 2 && typeArgs[1].getText() === "any") {
          typeArgs[1].replaceWithText("unknown");
          changed = true;
        }
      }
    }

    // 4. Find @ts-expect-error and remove the comment
    const text = sourceFile.getFullText();
    if (text.includes("@ts-expect-error")) {
        const newText = text.replace(/\/\/\s*@ts-expect-error[^\n]*\n/g, "");
        if (newText !== text) {
            sourceFile.replaceWithText(newText);
            changed = true;
        }
    }
    
    // We will NOT mass-replace anyKeyword here.

    if (changed) {
      sourceFile.saveSync();
      modifiedCount++;
      console.log(`Updated ${sourceFile.getFilePath()}`);
    }
  }

  console.log(`Done. Modified ${modifiedCount} files.`);
}

main().catch(console.error);
