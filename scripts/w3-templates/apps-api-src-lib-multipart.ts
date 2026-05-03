// Minimal multipart/form-data parser for Lambda. ~80 LOC, no deps.
//
// Usage:
//   const parts = parseMultipart(rawBody, contentTypeHeader);
//   parts.fields.id    // 'rysy_2026_05_15'
//   parts.fields.name  // 'Rysy szlak północny'
//   parts.fields.type  // 'off-piste'
//   parts.files.gpx    // { filename, contentType, data: Buffer }
//
// Caller must enforce overall body size before calling (see MAX_GPX_BYTES).

export interface MultipartFile {
  filename: string;
  contentType: string;
  data: Buffer;
}

export interface MultipartResult {
  fields: Record<string, string>;
  files: Record<string, MultipartFile>;
}

export function parseMultipart(body: Buffer, contentType: string): MultipartResult {
  const boundaryMatch = /boundary=("?)([^";]+)\1/.exec(contentType);
  if (!boundaryMatch) {
    throw new Error('Missing or malformed multipart boundary');
  }
  const boundary = '--' + boundaryMatch[2];
  const boundaryBuf = Buffer.from(boundary);

  const result: MultipartResult = { fields: {}, files: {} };

  let offset = 0;
  while (offset < body.length) {
    const startIdx = body.indexOf(boundaryBuf, offset);
    if (startIdx < 0) break;

    const headerStart = startIdx + boundaryBuf.length;
    if (body.slice(headerStart, headerStart + 2).toString() === '--') break; // end marker

    const headerEnd = body.indexOf('\r\n\r\n', headerStart);
    if (headerEnd < 0) break;

    const headerBlock = body.slice(headerStart, headerEnd).toString('utf-8');
    const partStart = headerEnd + 4;
    const nextBoundary = body.indexOf(boundaryBuf, partStart);
    const partEnd = nextBoundary < 0 ? body.length : nextBoundary - 2; // strip trailing CRLF

    const headers: Record<string, string> = {};
    for (const line of headerBlock.split('\r\n')) {
      const colon = line.indexOf(':');
      if (colon > 0) {
        headers[line.slice(0, colon).trim().toLowerCase()] = line.slice(colon + 1).trim();
      }
    }

    const disposition = headers['content-disposition'] ?? '';
    const nameMatch = /name="([^"]+)"/.exec(disposition);
    if (!nameMatch) {
      offset = nextBoundary < 0 ? body.length : nextBoundary;
      continue;
    }
    const name = nameMatch[1];

    const filenameMatch = /filename="([^"]*)"/.exec(disposition);
    if (filenameMatch && filenameMatch[1]) {
      result.files[name] = {
        filename: filenameMatch[1],
        contentType: headers['content-type'] ?? 'application/octet-stream',
        data: body.slice(partStart, partEnd),
      };
    } else {
      result.fields[name] = body.slice(partStart, partEnd).toString('utf-8');
    }

    offset = nextBoundary < 0 ? body.length : nextBoundary;
  }

  return result;
}
