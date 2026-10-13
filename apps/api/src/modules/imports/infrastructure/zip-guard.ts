/**
 * A look at a zip's central directory before anything is unpacked. An xlsx is a zip, and a few
 * kilobytes can claim gigabytes once expanded (a "zip bomb"). The sizes are read from the directory
 * without decompressing anything.
 */
export interface ZipFacts {
  entries: number;
  uncompressedBytes: number;
}

const END_OF_CENTRAL_DIRECTORY = 0x06054b50;
const CENTRAL_HEADER = 0x02014b50;
const ZIP64_MARKER = 0xffffffff;

export class MalformedZip extends Error {}

export function inspectZip(zip: Buffer): ZipFacts {
  let end = -1;
  // The end record is the last 22 bytes plus an optional comment of at most 65535 bytes.
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 22 - 0xffff); i -= 1) {
    if (zip.readUInt32LE(i) === END_OF_CENTRAL_DIRECTORY) {
      end = i;
      break;
    }
  }
  if (end < 0) throw new MalformedZip('No end of central directory');
  const entries = zip.readUInt16LE(end + 10);
  const directoryOffset = zip.readUInt32LE(end + 16);
  if (entries === 0xffff || directoryOffset === ZIP64_MARKER) throw new MalformedZip('Zip64 is not accepted');

  let position = directoryOffset;
  let uncompressedBytes = 0;
  for (let i = 0; i < entries; i += 1) {
    if (position + 46 > zip.length || zip.readUInt32LE(position) !== CENTRAL_HEADER) throw new MalformedZip('Bad central directory');
    const size = zip.readUInt32LE(position + 24);
    if (size === ZIP64_MARKER) throw new MalformedZip('Zip64 is not accepted');
    uncompressedBytes += size;
    position += 46 + zip.readUInt16LE(position + 28) + zip.readUInt16LE(position + 30) + zip.readUInt16LE(position + 32);
  }
  return { entries, uncompressedBytes };
}
