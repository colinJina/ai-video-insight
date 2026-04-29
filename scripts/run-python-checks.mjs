import { existsSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const projectRoot = process.cwd();
const pythonBackendDir = path.join(projectRoot, "python-backend");
const pythonExecutable = path.join(
  pythonBackendDir,
  ".venv",
  "Scripts",
  "python.exe",
);

if (!existsSync(pythonExecutable)) {
  console.error(
    [
      "Python hook checks could not start.",
      `Expected virtual environment interpreter at: ${pythonExecutable}`,
      "Create the backend virtual environment and install dependencies before committing.",
    ].join("\n"),
  );
  process.exit(1);
}

runPython(["-m", "compileall", "app", "tests"]);
runPython(["-m", "pytest", "-q"]);
runCommand(process.platform === "win32" ? "pyright.cmd" : "pyright", [], {
  cwd: projectRoot,
});

function runPython(args) {
  runCommand(pythonExecutable, args, { cwd: pythonBackendDir });
}

function runCommand(command, args, options) {
  const result = spawnSync(command, args, {
    ...options,
    stdio: "inherit",
    shell: process.platform === "win32",
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
