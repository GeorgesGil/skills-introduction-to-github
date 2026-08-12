export function selectValidationCommands(paths, packageScripts = {}) {
  const names = new Set((paths || []).map((path) => String(path).replaceAll("\\", "/")));
  const commands = [];
  if (names.has("package.json")) {
    const qa = Boolean(packageScripts.qa);
    if (qa) {
      for (const name of ["test", "typecheck", "lint", "format:check", "qa"]) {
        if (!packageScripts[name]) throw new Error(`QA validation requires package script: ${name}`);
      }
    }
    commands.push(["npm", packageScripts.test ? ["test"] : ["test", "--if-present"]]);
    if (packageScripts.typecheck) commands.push(["npm", ["run", "typecheck"]]);
    commands.push(["npm", packageScripts.lint ? ["run", "lint"] : ["run", "lint", "--if-present"]]);
    if (packageScripts["format:check"]) commands.push(["npm", ["run", "format:check"]]);
    if (qa) commands.push(["npm", ["run", "qa"]]);
  } else if (names.has("pyproject.toml") || names.has("requirements.txt")) {
    commands.push(["python", ["-m", "pytest", "-q"]]);
  } else if (names.has("go.mod")) {
    commands.push(["go", ["test", "./..."]]);
  } else if (names.has("Cargo.toml")) {
    commands.push(["cargo", ["test"]]);
  } else if (names.has("pom.xml")) {
    commands.push(["mvn", ["test", "-B"]]);
  } else if (names.has("gradlew")) {
    commands.push(["./gradlew", ["test", "--no-daemon"]]);
  }
  commands.push(["git", ["diff", "--check"]]);
  return commands;
}
