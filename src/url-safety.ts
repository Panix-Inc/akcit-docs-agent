import { isIP } from "node:net";

// Blocked IPv4 CIDR ranges (no external deps — manual CIDR check)
const BLOCKED_IPV4_RANGES: Array<{ base: number; mask: number }> = [
  { base: ipv4ToInt("127.0.0.0"), mask: prefixToMask(8) },   // loopback
  { base: ipv4ToInt("10.0.0.0"), mask: prefixToMask(8) },    // RFC-1918
  { base: ipv4ToInt("172.16.0.0"), mask: prefixToMask(12) }, // RFC-1918
  { base: ipv4ToInt("192.168.0.0"), mask: prefixToMask(16) }, // RFC-1918
  { base: ipv4ToInt("169.254.0.0"), mask: prefixToMask(16) }, // link-local
];

function ipv4ToInt(ip: string): number {
  const parts = ip.split(".");
  return (
    ((Number(parts[0]) << 24) |
      (Number(parts[1]) << 16) |
      (Number(parts[2]) << 8) |
      Number(parts[3])) >>> 0
  );
}

function prefixToMask(prefix: number): number {
  return (0xffffffff << (32 - prefix)) >>> 0;
}

function isBlockedIPv4(hostname: string): boolean {
  if (isIP(hostname) !== 4) return false;
  const ip = ipv4ToInt(hostname);
  return BLOCKED_IPV4_RANGES.some(({ base, mask }) => (ip & mask) === (base & mask));
}

function isBlockedIPv6(hostname: string): boolean {
  // Strip brackets from IPv6 addresses in URL hostnames
  const raw = hostname.startsWith("[") && hostname.endsWith("]")
    ? hostname.slice(1, -1)
    : hostname;
  if (isIP(raw) !== 6) return false;
  const lower = raw.toLowerCase();
  // loopback ::1
  if (lower === "::1") return true;
  // fc00::/7 — ULA (fc00 and fd00 prefixes)
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true;
  return false;
}

export function assertSafeUrl(rawUrl: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error(`Unsafe URL: invalid URL "${rawUrl}"`);
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`Unsafe URL: protocol "${parsed.protocol}" is not allowed`);
  }

  const hostname = parsed.hostname.toLowerCase();

  if (hostname === "localhost") {
    throw new Error(`Unsafe URL: hostname "localhost" is blocked`);
  }

  if (isBlockedIPv4(hostname)) {
    throw new Error(`Unsafe URL: IPv4 address "${hostname}" is in a blocked range`);
  }

  if (isBlockedIPv6(hostname)) {
    throw new Error(`Unsafe URL: IPv6 address "${hostname}" is in a blocked range`);
  }

  return parsed;
}
