import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { makeEventMessage } from "./bridge-protocol-core";
import {
  decodeTaggedChunk,
  encodeTaggedChunk,
  makePubFsCancelMessage,
  makePubFsDeleteMessage,
  makePubFsDoneMessage,
  makePubFsErrorMessage,
  makePubFsMetadataMessage,
  makePubFsReadMessage,
  makePubFsWriteMessage,
  PUB_FS_CANCEL_EVENT,
  PUB_FS_DELETE_EVENT,
  PUB_FS_DONE_EVENT,
  PUB_FS_READ_EVENT,
  PUB_FS_URL_PREFIX,
  PUB_FS_WRITE_EVENT,
  parsePubFsCancelMessage,
  parsePubFsCancelRequest,
  parsePubFsDeleteMessage,
  parsePubFsDeleteRequest,
  parsePubFsDoneMessage,
  parsePubFsErrorMessage,
  parsePubFsErrorResponse,
  parsePubFsMetadataMessage,
  parsePubFsMetadataResponse,
  parsePubFsReadMessage,
  parsePubFsReadRequest,
  parsePubFsWriteMessage,
  parsePubFsWriteRequest,
} from "./pub-fs-protocol-core";

describe("parsePubFsReadRequest", () => {
  it("parses valid request with range", () => {
    const result = parsePubFsReadRequest({
      requestId: "r1",
      path: "/home/user/file.mp4",
      rangeStart: 0,
      rangeEnd: 1024,
    });
    expect(result).toEqual({
      requestId: "r1",
      path: "/home/user/file.mp4",
      rangeStart: 0,
      rangeEnd: 1024,
    });
  });

  it("parses valid request without range", () => {
    const result = parsePubFsReadRequest({ requestId: "r2", path: "/img.png" });
    expect(result).toEqual({
      requestId: "r2",
      path: "/img.png",
      rangeStart: undefined,
      rangeEnd: undefined,
    });
  });

  it("rejects missing path", () => {
    expect(parsePubFsReadRequest({ requestId: "r3" })).toBeNull();
  });

  it("rejects negative range", () => {
    const result = parsePubFsReadRequest({
      requestId: "r4",
      path: "/f",
      rangeStart: -1,
    });
    expect(result?.rangeStart).toBeUndefined();
  });

  it("rejects non-object", () => {
    expect(parsePubFsReadRequest("not an object")).toBeNull();
    expect(parsePubFsReadRequest(null)).toBeNull();
  });
});

describe("parsePubFsMetadataResponse", () => {
  it("parses valid metadata", () => {
    const result = parsePubFsMetadataResponse({
      requestId: "r1",
      totalSize: 5000,
      mime: "video/mp4",
      rangeStart: 0,
      rangeEnd: 4999,
    });
    expect(result).toEqual({
      requestId: "r1",
      totalSize: 5000,
      mime: "video/mp4",
      rangeStart: 0,
      rangeEnd: 4999,
    });
  });

  it("rejects missing mime", () => {
    expect(
      parsePubFsMetadataResponse({
        requestId: "r1",
        totalSize: 100,
        rangeStart: 0,
        rangeEnd: 99,
      }),
    ).toBeNull();
  });
});

describe("parsePubFsErrorResponse", () => {
  it("parses valid error", () => {
    const result = parsePubFsErrorResponse({
      requestId: "r1",
      code: "NOT_FOUND",
      message: "File not found",
    });
    expect(result).toEqual({ requestId: "r1", code: "NOT_FOUND", message: "File not found" });
  });

  it("rejects empty code", () => {
    expect(parsePubFsErrorResponse({ requestId: "r1", code: "", message: "m" })).toBeNull();
  });
});

describe("parsePubFsCancelRequest", () => {
  it("parses valid cancel", () => {
    expect(parsePubFsCancelRequest({ requestId: "r1" })).toEqual({ requestId: "r1" });
  });

  it("rejects empty requestId", () => {
    expect(parsePubFsCancelRequest({ requestId: "" })).toBeNull();
  });
});

describe("bridge message round-trip", () => {
  it("read request round-trips", () => {
    const msg = makePubFsReadMessage({ requestId: "r1", path: "/test.txt" });
    expect(msg.type).toBe("event");
    expect(msg.data).toBe(PUB_FS_READ_EVENT);
    expect(parsePubFsReadMessage(msg)).toEqual({
      requestId: "r1",
      path: "/test.txt",
      rangeStart: undefined,
      rangeEnd: undefined,
    });
  });

  it("metadata response round-trips", () => {
    const payload = {
      requestId: "r1",
      totalSize: 1000,
      mime: "image/png",
      rangeStart: 0,
      rangeEnd: 999,
    };
    const msg = makePubFsMetadataMessage(payload);
    expect(parsePubFsMetadataMessage(msg)).toEqual(payload);
  });

  it("error response round-trips", () => {
    const payload = { requestId: "r1", code: "READ_ERROR", message: "Permission denied" };
    const msg = makePubFsErrorMessage(payload);
    expect(parsePubFsErrorMessage(msg)).toEqual(payload);
  });

  it("done message round-trips", () => {
    const msg = makePubFsDoneMessage("r1");
    expect(msg.data).toBe(PUB_FS_DONE_EVENT);
    expect(parsePubFsDoneMessage(msg)).toBe("r1");
  });

  it("cancel message round-trips", () => {
    const msg = makePubFsCancelMessage({ requestId: "r1" });
    expect(msg.data).toBe(PUB_FS_CANCEL_EVENT);
    expect(parsePubFsCancelMessage(msg)).toEqual({ requestId: "r1" });
  });

  it("write request round-trips", () => {
    const msg = makePubFsWriteMessage({ requestId: "w1", path: "/tmp/out.txt", size: 100 });
    expect(msg.data).toBe(PUB_FS_WRITE_EVENT);
    expect(parsePubFsWriteMessage(msg)).toEqual({
      requestId: "w1",
      path: "/tmp/out.txt",
      size: 100,
    });
  });

  it("delete request round-trips", () => {
    const msg = makePubFsDeleteMessage({ requestId: "d1", path: "/tmp/old.txt" });
    expect(msg.data).toBe(PUB_FS_DELETE_EVENT);
    expect(parsePubFsDeleteMessage(msg)).toEqual({ requestId: "d1", path: "/tmp/old.txt" });
  });

  it("rejects wrong event type", () => {
    const msg = makeEventMessage("status", { requestId: "r1" });
    expect(parsePubFsReadMessage(msg)).toBeNull();
    expect(parsePubFsWriteMessage(msg)).toBeNull();
    expect(parsePubFsDeleteMessage(msg)).toBeNull();
    expect(parsePubFsMetadataMessage(msg)).toBeNull();
    expect(parsePubFsErrorMessage(msg)).toBeNull();
    expect(parsePubFsDoneMessage(msg)).toBeNull();
    expect(parsePubFsCancelMessage(msg)).toBeNull();
  });
});

describe("parsePubFsWriteRequest", () => {
  it("parses valid write", () => {
    expect(parsePubFsWriteRequest({ requestId: "w1", path: "/tmp/f.txt", size: 42 })).toEqual({
      requestId: "w1",
      path: "/tmp/f.txt",
      size: 42,
    });
  });

  it("rejects negative size", () => {
    expect(parsePubFsWriteRequest({ requestId: "w1", path: "/f", size: -1 })).toBeNull();
  });
});

describe("parsePubFsDeleteRequest", () => {
  it("parses valid delete", () => {
    expect(parsePubFsDeleteRequest({ requestId: "d1", path: "/tmp/f.txt" })).toEqual({
      requestId: "d1",
      path: "/tmp/f.txt",
    });
  });

  it("rejects missing path", () => {
    expect(parsePubFsDeleteRequest({ requestId: "d1" })).toBeNull();
  });
});

describe("tagged binary chunks", () => {
  function decode(encoded: Uint8Array) {
    const result = decodeTaggedChunk(encoded.buffer as ArrayBuffer);
    expect(result).not.toBeNull();
    return result as NonNullable<typeof result>;
  }

  it("round-trips requestId and data", () => {
    const requestId = "lq8z2m4-0-a1b2";
    const data = new Uint8Array([10, 20, 30, 40, 50]);
    const decoded = decode(encodeTaggedChunk(requestId, data));
    expect(decoded.requestId).toBe(requestId);
    expect(new Uint8Array(decoded.data)).toEqual(data);
  });

  it("handles empty data payload", () => {
    const decoded = decode(encodeTaggedChunk("r1", new Uint8Array(0)));
    expect(decoded.requestId).toBe("r1");
    expect(decoded.data.byteLength).toBe(0);
  });

  it("handles large requestId", () => {
    const id = "x".repeat(300);
    const data = new Uint8Array([1]);
    const decoded = decode(encodeTaggedChunk(id, data));
    expect(decoded.requestId).toBe(id);
    expect(new Uint8Array(decoded.data)).toEqual(data);
  });

  it("rejects buffer shorter than 2 bytes", () => {
    expect(decodeTaggedChunk(new ArrayBuffer(0))).toBeNull();
    expect(decodeTaggedChunk(new ArrayBuffer(1))).toBeNull();
  });

  it("rejects buffer with length exceeding available bytes", () => {
    const buf = new ArrayBuffer(4);
    new DataView(buf).setUint16(0, 100);
    expect(decodeTaggedChunk(buf)).toBeNull();
  });

  it("rejects zero-length requestId", () => {
    const buf = new ArrayBuffer(4);
    new DataView(buf).setUint16(0, 0);
    expect(decodeTaggedChunk(buf)).toBeNull();
  });

  it("preserves binary data integrity for 64KB chunks", () => {
    const chunkSize = 64 * 1024;
    const data = new Uint8Array(chunkSize);
    for (let i = 0; i < chunkSize; i++) data[i] = i & 0xff;
    const decoded = decode(encodeTaggedChunk("req-42", data));
    expect(new Uint8Array(decoded.data)).toEqual(data);
  });

  it("correctly demultiplexes interleaved chunks from different requests", () => {
    const d1 = decode(encodeTaggedChunk("req-a", new Uint8Array([1, 2, 3])));
    const d2 = decode(encodeTaggedChunk("req-b", new Uint8Array([4, 5, 6])));
    const d3 = decode(encodeTaggedChunk("req-a", new Uint8Array([7, 8, 9])));

    expect(d1.requestId).toBe("req-a");
    expect(d2.requestId).toBe("req-b");
    expect(d3.requestId).toBe("req-a");
    expect(new Uint8Array(d1.data)).toEqual(new Uint8Array([1, 2, 3]));
    expect(new Uint8Array(d2.data)).toEqual(new Uint8Array([4, 5, 6]));
    expect(new Uint8Array(d3.data)).toEqual(new Uint8Array([7, 8, 9]));
  });
});

describe("SW prefix drift", () => {
  it("sw.js uses the same prefix as PUB_FS_URL_PREFIX", () => {
    const swPath = resolve(__dirname, "../web/public/sandbox/sw.js");
    const swSource = readFileSync(swPath, "utf-8");
    const match = swSource.match(/var PUB_FS_PREFIX\s*=\s*"([^"]+)"/);
    expect(match).not.toBeNull();
    expect(match?.[1]).toBe(PUB_FS_URL_PREFIX);
  });
});
