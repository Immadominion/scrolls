// Small UI helpers — branded, terse output.
//
// Brand: violet (#a78bfa) primary, cyan (#06b6d4) secondary, on near-
// black backgrounds. picocolors hex is approximated by 256-colour
// codes; we keep usage minimal so any terminal looks clean.

import pc from "picocolors";

export const violet = (s: string) => pc.magenta(s);
export const cyan = (s: string) => pc.cyan(s);
export const dim = (s: string) => pc.dim(s);
export const bold = (s: string) => pc.bold(s);
export const red = (s: string) => pc.red(s);
export const green = (s: string) => pc.green(s);
export const yellow = (s: string) => pc.yellow(s);

export function banner(): void {
    console.log(`${violet(bold("✦ scrolls"))} ${dim("·")} ${dim("walrus-native forms")}`);
}

export function ok(msg: string): void {
    console.log(`${green("✓")} ${msg}`);
}

export function info(msg: string): void {
    console.log(`${cyan("·")} ${msg}`);
}

export function warn(msg: string): void {
    console.log(`${yellow("!")} ${msg}`);
}

export function fail(msg: string): never {
    console.error(`${red("✗")} ${msg}`);
    process.exit(1);
}

export function kv(label: string, value: string): void {
    console.log(`  ${dim(label.padEnd(14))} ${value}`);
}

export function truncate(s: string, n = 12): string {
    if (s.length <= n * 2 + 1) return s;
    return `${s.slice(0, n)}…${s.slice(-4)}`;
}
