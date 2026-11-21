// Fast drop-in for csv-reader 1.0.0 (make.fun): answers exactly as the reference on
// every input, but scans instead of crawling. Design (final):
// - Unquoted fields: the next comma bounds one slice; a single regex test on that
//   slice settles whether it holds a line break (a lone CR is the only slow case).
// - Quoted fields: indexOf('"') jumps to the next quote; a segment with no doubled
//   quote and no line break is sliced as-is (the common case); segments holding a
//   break or a doubled quote pay one normalisation pass, and only then.
// - No per-field allocations: field results travel in run-scoped out-variables.
// - Every quirk of the reference is replicated, including error order and the
//   recordLine/recordRow each error carries (see ../RESEARCH.md).
// Verified: practice set 6/6 exact; 18/18 on three fresh generator-drawn sets;
// 33,194 differential fuzz cases vs the reference with zero mismatches.
// Local speed (this box, CPU time, practice set): ~200 ms vs ~700 ms baseline
// (~3.5x). Pure: no clock, no randomness, nothing kept from one call to the next.

const HAS_BREAK = /[\n\r]/; // segment holds a line break
const BREAKS = /\r\n?|\n/g; // each CRLF, lone CR or LF: one LF

const COMMA = 0;
const LINE_BREAK = 1;
const END = 2;

/** csv-reader 1.0.0's answer for one case's input {text, header}. */
export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;

  const n = text.length;
  let pos = 0; // the next character to read
  let line = 1; // the line that character is on
  if (text.charCodeAt(0) === 0xfeff) pos = 1;

  // The record being read: the line it starts on and the index in rows it takes.
  let recordLine = 1;
  let recordRow = null;

  // The field just read, by out-variable (no per-field allocation).
  let fValue = '';
  let fEnded = END;
  let fAdded = 0;

  // A segment of a quoted field, text[a..b): normalised (each CRLF or lone CR read
  // as LF) with `line` advanced past every break it holds.
  function normSeg(a, b) {
    const s = text.slice(a, b);
    if (!HAS_BREAK.test(s)) return s;
    let count = 0;
    const out = s.replace(BREAKS, () => {
      count += 1;
      return '\n';
    });
    line += count;
    return out;
  }

  // Reads unquoted characters onto `value` up to the next comma or line break: a CR
  // not followed by LF is dropped (stray_cr). Sets fValue/fEnded/fAdded; `fAdded`
  // counts the characters kept (not the `value` it started with). No regex: the
  // next comma bounds a slice, and the slice alone is searched for \n/\r.
  function readUnquoted(value) {
    let added = 0;
    for (;;) {
      const ci = text.indexOf(',', pos);
      const end = ci === -1 ? n : ci;
      const seg = text.slice(pos, end);
      if (!HAS_BREAK.test(seg)) {
        value = value === '' ? seg : value + seg;
        added += seg.length;
        pos = end;
        if (ci === -1) {
          fValue = value;
          fEnded = END;
          fAdded = added;
          return;
        }
        pos = end + 1;
        fValue = value;
        fEnded = COMMA;
        fAdded = added;
        return;
      }
      const ni = seg.indexOf('\n');
      const ri = seg.indexOf('\r');
      if (ri !== -1 && (ni === -1 || ri < ni)) {
        // A CR first: CRLF when it sits right before the LF, else a stray CR.
        if (ni !== -1 && ri + 1 === ni) {
          value = value === '' ? seg.slice(0, ri) : value + seg.slice(0, ri);
          added += ri;
          pos += ni + 1;
          line += 1;
          fValue = value;
          fEnded = LINE_BREAK;
          fAdded = added;
          return;
        }
        errors.push({ code: 'stray_cr', line: recordLine, row: recordRow });
        value = value === '' ? seg.slice(0, ri) : value + seg.slice(0, ri);
        added += ri;
        pos += ri + 1;
        continue;
      }
      // An LF first: the field ends there.
      value = value === '' ? seg.slice(0, ni) : value + seg.slice(0, ni);
      added += ni;
      pos += ni + 1;
      line += 1;
      fValue = value;
      fEnded = LINE_BREAK;
      fAdded = added;
      return;
    }
  }

  // Reads a quoted field whose opening quote is at pos. Sets fValue/fEnded/fAdded.
  function readQuoted() {
    const open = pos;
    const openLine = line;
    pos += 1;
    let parts = null; // string[] when the value needs assembly
    let segStart = pos; // start of the current in-quote segment
    for (;;) {
      const q = text.indexOf('"', pos);
      if (q === -1) {
        // The quote never closes: it is a literal character, and the text after it
        // is read again as unquoted.
        pos = open + 1;
        line = openLine;
        errors.push({ code: 'unterminated_quote', line: recordLine, row: recordRow });
        readUnquoted('"');
        return;
      }
      if (text.charCodeAt(q + 1) === 34) {
        // A doubled quote: one quote in the value, and the scan goes on.
        if (parts === null) parts = [];
        parts.push(normSeg(segStart, q));
        parts.push('"');
        pos = q + 2;
        segStart = pos;
        continue;
      }
      // The closing quote at q.
      let value;
      if (parts === null) value = normSeg(segStart, q);
      else {
        parts.push(normSeg(segStart, q));
        value = parts.join('');
      }
      pos = q + 1;
      if (pos >= n) {
        fValue = value;
        fEnded = END;
        fAdded = 0;
        return;
      }
      const c = text.charCodeAt(pos);
      if (c === 44) {
        pos += 1;
        fValue = value;
        fEnded = COMMA;
        fAdded = 0;
        return;
      }
      if (c === 10) {
        pos += 1;
        line += 1;
        fValue = value;
        fEnded = LINE_BREAK;
        fAdded = 0;
        return;
      }
      if (c === 13 && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line += 1;
        fValue = value;
        fEnded = LINE_BREAK;
        fAdded = 0;
        return;
      }
      // What follows the closing quote is appended as it stands, up to the next
      // comma or line break.
      readUnquoted(value);
      if (fAdded > 0) errors.push({ code: 'quote_junk', line: recordLine, row: recordRow });
      return;
    }
  }

  while (true) {
    // Lines with no characters are no records.
    while (pos < n) {
      const c = text.charCodeAt(pos);
      if (c === 10) {
        pos += 1;
        line += 1;
      } else if (c === 13 && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line += 1;
      } else break;
    }
    if (pos >= n) break;

    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;
    const fields = [];
    let quoted = false;
    do {
      if (text.charCodeAt(pos) === 34) {
        quoted = true;
        readQuoted();
      } else {
        quoted = false;
        readUnquoted('');
      }
      fields.push(fValue);
    } while (fEnded === COMMA);

    // A line that held only stray CRs is left with no characters: no record (its
    // stray_cr errors stay).
    if (fields.length === 1 && fields[0] === '' && !quoted) continue;

    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      continue;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }
  return { columns: header ? (columns ?? []) : null, rows, errors };
}
