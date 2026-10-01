const HOSTNAME_PATTERN = /^(?=.{1,253}$)(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)(?:\.(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?))*$/;
const IPV4_TAIL_PATTERN = /^(.*:)(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
const IPV6_GROUP_PATTERN = /^[0-9A-Fa-f]{1,4}$/;

export function isValidPort(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 65535;
}

export function isValidHostname(value: unknown): value is string {
  return typeof value === 'string' && HOSTNAME_PATTERN.test(value);
}

// Replaces a dotted IPv4 tail with two hex groups so the rest is plain IPv6.
function replaceIPv4Tail(value: string): string | null {
  const tail = IPV4_TAIL_PATTERN.exec(value);
  if (!tail) {
    return value.includes('.') ? null : value;
  }

  const octets = tail.slice(2).map(Number);
  if (octets.some((octet) => octet > 255)) {
    return null;
  }

  const high = ((octets[0]! << 8) | octets[1]!).toString(16);
  const low = ((octets[2]! << 8) | octets[3]!).toString(16);

  return `${tail[1]}${high}:${low}`;
}

// Returns the eight 16-bit groups, or null when the text is not an IPv6 address.
export function parseIPv6(value: string): number[] | null {
  if (!value.includes(':') || value.includes(':::')) {
    return null;
  }

  const candidate = replaceIPv4Tail(value.toLowerCase());
  if (candidate === null) {
    return null;
  }

  const halves = candidate.split('::');
  if (halves.length > 2) {
    return null;
  }

  const validSide = (side: string) => side === '' || side.split(':').every((part) => IPV6_GROUP_PATTERN.test(part));
  if (!halves.every(validSide)) {
    return null;
  }

  const toGroups = (side: string | undefined) => (side ? side.split(':').map((part) => Number.parseInt(part, 16)) : []);
  const left = toGroups(halves[0]);
  const right = halves.length === 2 ? toGroups(halves[1]) : [];

  if (halves.length === 2) {
    const missing = 8 - left.length - right.length;

    return missing > 0 ? [...left, ...Array<number>(missing).fill(0), ...right] : null;
  }

  return left.length === 8 ? left : null;
}

export function isValidIPv6(value: string): boolean {
  return parseIPv6(value) !== null;
}

// NGINX and inet_aton accept shortened, octal, and hex IPv4 spellings, so loopback
// checks must understand them too. Returns the 32-bit address or null.
export function parseIPv4Literal(value: string): number | null {
  const parts = value.split('.');
  if (parts.length > 4 || parts.some((part) => part === '')) {
    return null;
  }

  const widthsByLength: Record<number, number[]> = {
    1: [32],
    2: [8, 24],
    3: [8, 8, 16],
    4: [8, 8, 8, 8]
  };
  const widths = widthsByLength[parts.length]!;
  let address = 0;

  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index]!;
    let radix = 10;
    if (/^0x[0-9A-Fa-f]+$/i.test(part)) {
      radix = 16;
    } else if (/^0[0-7]+$/.test(part)) {
      radix = 8;
    } else if (!/^\d+$/.test(part)) {
      return null;
    }

    const number = Number.parseInt(part, radix);
    const width = widths[index]!;
    if (!Number.isSafeInteger(number) || number < 0 || number >= 2 ** width) {
      return null;
    }

    address = address * 2 ** width + number;
  }

  return address;
}

export function isStrictIPv4(value: string): boolean {
  return /^(?:\d{1,3}\.){3}\d{1,3}$/.test(value) && value.split('.').every((octet) => Number(octet) <= 255);
}

export function isLoopbackHost(host: string): boolean {
  const normalized = host.toLowerCase();
  if (normalized === 'localhost' || normalized === '::1') {
    return true;
  }

  const ipv4 = parseIPv4Literal(normalized);
  if (ipv4 !== null) {
    return Math.floor(ipv4 / 2 ** 24) === 127;
  }

  const groups = parseIPv6(normalized);
  if (!groups) {
    return false;
  }
  if (groups.slice(0, 7).every((group) => group === 0) && groups[7] === 1) {
    return true;
  }

  // An IPv4-mapped loopback address has the ::ffff prefix, not ::.
  return groups.slice(0, 5).every((group) => group === 0) && groups[5] === 0xffff && (groups[6]! >> 8) === 127;
}

export function isUnspecifiedHost(host: string): boolean {
  const normalized = host.toLowerCase();
  const ipv4 = parseIPv4Literal(normalized);
  if (ipv4 !== null) {
    return ipv4 === 0;
  }

  const groups = parseIPv6(normalized);
  if (!groups) {
    return false;
  }
  if (groups.every((group) => group === 0)) {
    return true;
  }

  return groups.slice(0, 5).every((group) => group === 0) && groups[5] === 0xffff && groups[6] === 0 && groups[7] === 0;
}

export interface ParsedHostPort {
  host: string;
  port: number;
}

export function parseHostPort(value: string): ParsedHostPort | null {
  const bracketed = /^\[([0-9A-Fa-f:.]+)\]:(\d+)$/.exec(value);
  if (bracketed) {
    const host = bracketed[1]!;
    const port = Number(bracketed[2]);

    return isValidIPv6(host) && isValidPort(port) ? { host, port } : null;
  }

  const plain = /^([^:]+):(\d+)$/.exec(value);
  if (!plain) {
    return null;
  }

  const host = plain[1]!;
  const port = Number(plain[2]);

  return isValidHostname(host) && isValidPort(port) ? { host, port } : null;
}

export interface ParsedCidr {
  address: string;
  prefix: number;
  family: 4 | 6;
}

// A trusted-proxy entry is an IP or CIDR. A prefix of 0 would trust the whole internet.
export function parseCidr(value: string): ParsedCidr | null {
  const [address, prefixText, ...extra] = value.split('/');
  if (address === undefined || extra.length > 0) {
    return null;
  }

  const isIPv6 = address.includes(':');
  const maximumPrefix = isIPv6 ? 128 : 32;
  if (prefixText !== undefined && !/^\d{1,3}$/.test(prefixText)) {
    return null;
  }

  const prefix = prefixText === undefined ? maximumPrefix : Number(prefixText);
  if (prefix < 1 || prefix > maximumPrefix) {
    return null;
  }

  if (isIPv6) {
    return isValidIPv6(address) ? { address, prefix, family: 6 } : null;
  }

  return isStrictIPv4(address) ? { address, prefix, family: 4 } : null;
}
