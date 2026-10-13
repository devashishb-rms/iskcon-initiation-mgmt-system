import { inspectZip, MalformedZip } from './zip-guard';

/** A minimal zip with stored entries, written by hand so the test needs no library. */
function zipWith(entries: Array<{ name: string; size: number }>): Buffer {
  const central: Buffer[] = [];
  for (const e of entries) {
    const h = Buffer.alloc(46 + e.name.length);
    h.writeUInt32LE(0x02014b50, 0);
    h.writeUInt32LE(e.size, 24);
    h.writeUInt16LE(e.name.length, 28);
    h.write(e.name, 46);
    central.push(h);
  }
  const directory = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(0, 16);
  return Buffer.concat([directory, end]);
}

describe('inspectZip', () => {
  it('adds up the unpacked sizes the directory declares', () => {
    expect(inspectZip(zipWith([{ name: 'a.xml', size: 100 }, { name: 'b.xml', size: 250 }]))).toEqual({ entries: 2, uncompressedBytes: 350 });
  });
  it('refuses Zip64 and damaged archives', () => {
    expect(() => inspectZip(zipWith([{ name: 'a', size: 0xffffffff }]))).toThrow(MalformedZip);
    expect(() => inspectZip(Buffer.from('PK\x03\x04 no end record here at all, just text'))).toThrow(MalformedZip);
    const damaged = zipWith([{ name: 'a', size: 1 }]);
    damaged.writeUInt32LE(0, 0);
    expect(() => inspectZip(damaged)).toThrow(MalformedZip);
  });
});
