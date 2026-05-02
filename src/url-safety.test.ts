import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:dns/promises", () => ({
  lookup: vi.fn()
}));

import { lookup } from "node:dns/promises";
import { assertSafeUrl, assertSafeUrlResolved } from "./url-safety.js";

const mockLookup = lookup as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockLookup.mockReset();
  mockLookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
});

describe("assertSafeUrl", () => {
  describe("accepted URLs", () => {
    it("accepts https://example.com", () => {
      const result = assertSafeUrl("https://example.com");
      expect(result.href).toBe("https://example.com/");
    });

    it("accepts http://example.com", () => {
      const result = assertSafeUrl("http://example.com");
      expect(result.href).toBe("http://example.com/");
    });

    it("accepts public IPv4 (1.1.1.1)", () => {
      expect(() => assertSafeUrl("http://1.1.1.1")).not.toThrow();
    });

    it("accepts public IPv6 (2001:4860:4860::8888)", () => {
      expect(() => assertSafeUrl("http://[2001:4860:4860::8888]")).not.toThrow();
    });

    it("accepts https URL with path and query", () => {
      expect(() => assertSafeUrl("https://docs.example.com/api/v1?page=2")).not.toThrow();
    });
  });

  describe("rejected protocols", () => {
    it("rejects file://", () => {
      expect(() => assertSafeUrl("file:///etc/passwd")).toThrow(/Unsafe URL/);
    });

    it("rejects ftp://", () => {
      expect(() => assertSafeUrl("ftp://example.com/file")).toThrow(/Unsafe URL/);
    });

    it("rejects javascript:", () => {
      expect(() => assertSafeUrl("javascript:alert(1)")).toThrow(/Unsafe URL/);
    });
  });

  describe("rejected IPv4 ranges", () => {
    it("rejects http://localhost", () => {
      expect(() => assertSafeUrl("http://localhost")).toThrow(/Unsafe URL/);
    });

    it("rejects http://127.0.0.1 (loopback)", () => {
      expect(() => assertSafeUrl("http://127.0.0.1")).toThrow(/Unsafe URL/);
    });

    it("rejects http://127.255.255.255 (loopback /8)", () => {
      expect(() => assertSafeUrl("http://127.255.255.255")).toThrow(/Unsafe URL/);
    });

    it("rejects http://10.0.0.5 (RFC-1918 /8)", () => {
      expect(() => assertSafeUrl("http://10.0.0.5")).toThrow(/Unsafe URL/);
    });

    it("rejects http://192.168.1.1 (RFC-1918 /16)", () => {
      expect(() => assertSafeUrl("http://192.168.1.1")).toThrow(/Unsafe URL/);
    });

    it("rejects http://172.16.0.1 (RFC-1918 /12 start)", () => {
      expect(() => assertSafeUrl("http://172.16.0.1")).toThrow(/Unsafe URL/);
    });

    it("rejects http://172.31.255.255 (RFC-1918 /12 end)", () => {
      expect(() => assertSafeUrl("http://172.31.255.255")).toThrow(/Unsafe URL/);
    });

    it("rejects http://169.254.169.254 (AWS metadata link-local)", () => {
      expect(() => assertSafeUrl("http://169.254.169.254")).toThrow(/Unsafe URL/);
    });

    it("does NOT reject http://172.32.0.1 (just outside RFC-1918 /12)", () => {
      expect(() => assertSafeUrl("http://172.32.0.1")).not.toThrow();
    });

    // H1 fixes — additional IPv4 bypasses caught by post-review hardening
    it("rejects http://0.0.0.0 (this network — routes to localhost)", () => {
      expect(() => assertSafeUrl("http://0.0.0.0")).toThrow(/Unsafe URL/);
    });

    it("rejects http://0.1.2.3 (0.0.0.0/8 range)", () => {
      expect(() => assertSafeUrl("http://0.1.2.3")).toThrow(/Unsafe URL/);
    });

    it("rejects http://255.255.255.255 (limited broadcast / 240/4 reserved)", () => {
      expect(() => assertSafeUrl("http://255.255.255.255")).toThrow(/Unsafe URL/);
    });

    it("rejects http://224.0.0.1 (multicast)", () => {
      expect(() => assertSafeUrl("http://224.0.0.1")).toThrow(/Unsafe URL/);
    });

    it("rejects http://100.64.0.1 (CGNAT)", () => {
      expect(() => assertSafeUrl("http://100.64.0.1")).toThrow(/Unsafe URL/);
    });
  });

  describe("rejected IPv6 ranges", () => {
    it("rejects http://[::1] (loopback)", () => {
      expect(() => assertSafeUrl("http://[::1]")).toThrow(/Unsafe URL/);
    });

    it("rejects http://[fc00::1] (ULA fc00::/7)", () => {
      expect(() => assertSafeUrl("http://[fc00::1]")).toThrow(/Unsafe URL/);
    });

    it("rejects http://[fd12:3456:789a::1] (ULA fd prefix)", () => {
      expect(() => assertSafeUrl("http://[fd12:3456:789a::1]")).toThrow(/Unsafe URL/);
    });

    it("accepts http://[2001:4860:4860::8888] (public IPv6)", () => {
      expect(() => assertSafeUrl("http://[2001:4860:4860::8888]")).not.toThrow();
    });

    it("accepts http://[2606:4700:4700::1111] (Cloudflare public IPv6)", () => {
      expect(() => assertSafeUrl("http://[2606:4700:4700::1111]")).not.toThrow();
    });

    // H2 fixes — additional IPv6 bypasses caught by post-review hardening
    it("rejects http://[fe80::1] (link-local fe80::/10)", () => {
      expect(() => assertSafeUrl("http://[fe80::1]")).toThrow(/Unsafe URL/);
    });

    it("rejects http://[ff02::1] (multicast)", () => {
      expect(() => assertSafeUrl("http://[ff02::1]")).toThrow(/Unsafe URL/);
    });

    it("rejects http://[::ffff:127.0.0.1] (IPv4-mapped loopback)", () => {
      expect(() => assertSafeUrl("http://[::ffff:127.0.0.1]")).toThrow(/Unsafe URL/);
    });

    it("rejects http://[::ffff:10.0.0.1] (IPv4-mapped RFC-1918)", () => {
      expect(() => assertSafeUrl("http://[::ffff:10.0.0.1]")).toThrow(/Unsafe URL/);
    });
  });

  describe("invalid URLs", () => {
    it("rejects empty string", () => {
      expect(() => assertSafeUrl("")).toThrow(/Unsafe URL/);
    });

    it("rejects plain hostname without protocol", () => {
      expect(() => assertSafeUrl("example.com")).toThrow(/Unsafe URL/);
    });
  });
});

describe("assertSafeUrlResolved", () => {
  it("accepts a hostname that resolves only to public addresses", async () => {
    mockLookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);

    const result = await assertSafeUrlResolved("https://example.com/docs");

    expect(result.href).toBe("https://example.com/docs");
    expect(mockLookup).toHaveBeenCalledWith("example.com", { all: true, verbatim: true });
  });

  it("rejects a public-looking hostname that resolves to loopback", async () => {
    mockLookup.mockResolvedValue([{ address: "127.0.0.1", family: 4 }]);

    await expect(assertSafeUrlResolved("https://docs.example.com")).rejects.toThrow(/blocked range/);
  });

  it("rejects a public-looking hostname that resolves to IPv6 ULA", async () => {
    mockLookup.mockResolvedValue([{ address: "fd12:3456:789a::1", family: 6 }]);

    await expect(assertSafeUrlResolved("https://docs.example.com")).rejects.toThrow(/Unsafe URL/);
  });

  it("does not do DNS lookup for literal public IPs", async () => {
    await expect(assertSafeUrlResolved("https://1.1.1.1")).resolves.toBeInstanceOf(URL);

    expect(mockLookup).not.toHaveBeenCalled();
  });
});
