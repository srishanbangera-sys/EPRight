// Remembers demo-path steps that are not visible in the data (e.g. "tried a duplicate ID").
const KEY = "epright_demo_flags";

export type DemoFlag = "dup" | "audit" | "report";

export function demoFlags(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "{}");
  } catch {
    return {};
  }
}

export function markDemo(flag: DemoFlag) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...demoFlags(), [flag]: true }));
    window.dispatchEvent(new Event("epright:demo"));
  } catch {
    /* storage unavailable */
  }
}

export function clearDemo() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* storage unavailable */
  }
}
