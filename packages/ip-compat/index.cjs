const net = require("node:net");
const ipaddr = require("ipaddr.js");

function isV4Format(address) {
  return typeof address === "string" && net.isIPv4(address);
}

function isV6Format(address) {
  return typeof address === "string" && net.isIPv6(address);
}

function isLoopback(address) {
  if (typeof address !== "string" || net.isIP(address) === 0) {
    return false;
  }

  const parsed = ipaddr.parse(address);
  if (parsed.kind() === "ipv4") {
    return parsed.range() === "loopback";
  }

  if (parsed.isIPv4MappedAddress()) {
    return parsed.toIPv4Address().range() === "loopback";
  }

  return parsed.range() === "loopback";
}

function toBuffer(address, buffer, offset = 0) {
  if (typeof address !== "string" || net.isIP(address) === 0) {
    throw new Error(`Invalid IP address: ${String(address)}`);
  }

  const bytes = ipaddr.parse(address).toByteArray();
  if (!buffer) return Buffer.from(bytes);

  for (let index = 0; index < bytes.length; index += 1) {
    buffer[offset + index] = bytes[index];
  }
  return buffer;
}

function toString(buffer, offset = 0, length = buffer.length - offset) {
  const bytes = Array.from(buffer.subarray(offset, offset + length));
  if (bytes.length !== 4 && bytes.length !== 16) {
    throw new Error(`Invalid IP buffer length: ${bytes.length}`);
  }
  return ipaddr.fromByteArray(bytes).toString();
}

module.exports = {
  isLoopback,
  isV4Format,
  isV6Format,
  toBuffer,
  toString,
};
module.exports.default = module.exports;
