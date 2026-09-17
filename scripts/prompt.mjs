// One-line confirmation prompt. Ctrl+C (which a TTY readline receives as a
// keypress, not a signal) or end of input cancel: the promise resolves to
// null and nothing else is read.
import { createInterface } from "node:readline";

export function askLine(question) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: Boolean(process.stdin.isTTY), historySize: 0 });
    let settled = false;
    const settle = (value) => {
      if (settled) return;
      settled = true;
      rl.close();
      process.stdin.pause();
      resolve(value);
    };
    rl.on("SIGINT", () => {
      process.stdout.write("\n");
      settle(null);
    });
    rl.on("close", () => settle(null));
    rl.question(question, (answer) => settle(answer.trim()));
  });
}
