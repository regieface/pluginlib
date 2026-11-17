"""Read/write LP's ValueTree container without interpreting opaque plugin data.

Independent implementation of the documented JUCE stream structure; no JUCE
runtime or source code is bundled. All variant payloads are retained verbatim.
"""
from __future__ import annotations
from dataclasses import dataclass, field
from pathlib import Path
import struct

class FormatError(ValueError):
    pass

def packed_int(value: int) -> bytes:
    magnitude = abs(value)
    count = (magnitude.bit_length() + 7) // 8
    if count > 4:
        raise FormatError('Integer too large')
    return bytes([count | (128 if value < 0 else 0)]) + magnitude.to_bytes(count, 'little')

@dataclass
class Variant:
    payload: bytes

    @property
    def value(self):
        if not self.payload:
            return None
        marker, body = self.payload[0], self.payload[1:]
        if marker == 1 and len(body) == 4:
            return struct.unpack('<i', body)[0]
        if marker == 6 and len(body) == 8:
            return struct.unpack('<q', body)[0]
        if marker in (2, 3) and not body:
            return marker == 2
        if marker == 4 and len(body) == 8:
            return struct.unpack('<d', body)[0]
        if marker == 5 and body.endswith(b'\0'):
            return body[:-1].decode('utf-8')
        return {'opaqueMarker': marker, 'bytes': len(body)}

    @staticmethod
    def of(value) -> Variant:
        if isinstance(value, bool):
            return Variant(bytes([2 if value else 3]))
        if isinstance(value, int):
            return Variant(b'\x01' + struct.pack('<i', value))
        if isinstance(value, float):
            return Variant(b'\x04' + struct.pack('<d', value))
        if isinstance(value, str) and '\0' not in value:
            return Variant(b'\x05' + value.encode('utf-8') + b'\0')
        raise FormatError('Unsupported new property type')

@dataclass
class Node:
    kind: str
    properties: dict[str, Variant] = field(default_factory=dict)
    children: list[Node] = field(default_factory=list)

    def values(self):
        return {key: item.value for key, item in self.properties.items()}

    def walk(self):
        yield self
        for child in self.children:
            yield from child.walk()

    def get(self, key, default=None):
        return self.properties[key].value if key in self.properties else default

    def set(self, key, value):
        self.properties[key] = Variant.of(value)

class Reader:
    def __init__(self, data: bytes):
        if len(data) > 128 * 1024 * 1024:
            raise FormatError('File exceeds 128 MB')
        self.data, self.position, self.nodes = data, 0, 0

    def take(self, count: int) -> bytes:
        if count < 0 or count > len(self.data) - self.position:
            raise FormatError(f'Truncated stream at {self.position}')
        result = self.data[self.position:self.position + count]
        self.position += count
        return result

    def integer(self) -> int:
        flag = self.take(1)[0]
        count = flag & 127
        if count > 4:
            raise FormatError('Invalid compressed integer')
        value = int.from_bytes(self.take(count), 'little')
        return -value if flag & 128 else value

    def string(self) -> str:
        end = self.data.find(b'\0', self.position)
        if end < 0:
            raise FormatError('Unterminated string')
        raw = self.take(end - self.position + 1)
        try:
            return raw[:-1].decode('utf-8')
        except UnicodeDecodeError as error:
            raise FormatError('Invalid UTF-8') from error

    def count(self) -> int:
        count = self.integer()
        if count < 0 or count > len(self.data) - self.position:
            raise FormatError('Invalid item count')
        return count

    def node(self, depth=0) -> Node:
        self.nodes += 1
        if depth >= 256 or self.nodes > 200000:
            raise FormatError('Tree limit exceeded')
        node = Node(self.string())
        for _ in range(self.count()):
            key = self.string()
            if not key or key in node.properties:
                raise FormatError('Invalid/duplicate property')
            node.properties[key] = Variant(self.take(self.count()))
        node.children = [self.node(depth + 1) for _ in range(self.count())]
        return node

def loads(data: bytes) -> Node:
    reader = Reader(data)
    root = reader.node()
    if reader.position != len(data):
        raise FormatError('Trailing data')
    return root

def dumps(root: Node) -> bytes:
    def text(value):
        if '\0' in value:
            raise FormatError('NUL in name')
        return value.encode('utf-8') + b'\0'
    def encode(node, depth=0):
        if depth >= 256:
            raise FormatError('Tree limit exceeded')
        result = text(node.kind) + packed_int(len(node.properties))
        for name, item in node.properties.items():
            result += text(name) + packed_int(len(item.payload)) + item.payload
        result += packed_int(len(node.children))
        for child in node.children:
            result += encode(child, depth + 1)
        return result
    return encode(root)

if __name__ == '__main__':
    import argparse
    import json
    from collections import Counter
    parser = argparse.ArgumentParser(description='Inspect LiveProfessor project structure without changing it')
    parser.add_argument('project', type=Path)
    args = parser.parse_args()
    original = args.project.read_bytes()
    root = loads(original)
    print(json.dumps({'root': root.kind, 'bytes': len(original), 'byteExactRoundTrip': dumps(root) == original,
                      'nodes': dict(Counter(node.kind for node in root.walk()))}, ensure_ascii=False, indent=2))
