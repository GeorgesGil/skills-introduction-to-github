export function selectValidationCommands(paths) {
  const names = new Set((paths || []).map((path) => String(path).replaceAll("\\", "/")));
  const commands = [];
  if (names.has("package.json")) {
    commands.push(["npm", ["test", "--if-present"]]);
    commands.push(["npm", ["run", "lint", "--if-present"]]);
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
