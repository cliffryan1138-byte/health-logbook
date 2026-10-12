// Spreadsheets, Word files and text files -> plain text, on the phone, so
// read-notes can read a headache journal kept in Excel or Word the same way it
// reads a PDF. Testers keep diaries in all of these; the importer used to grey
// them out because it only took photos and PDFs.
//
// Only the text leaves the phone. Apple's Numbers and Pages formats can't be
// read outside Apple's apps, so those get instructions to export instead.
// The readers are loaded only when such a file is picked.

const MAX_CHARS = 300_000 // a few years of daily entries; more than one reading

export const ACCEPT = [
  'image/*', 'application/pdf', '.pdf',
  '.csv', 'text/csv', '.tsv', '.txt', 'text/plain',
  '.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  // Picked only to explain how to export them (see APPLE / OLD_OFFICE).
  '.numbers', '.pages', '.xls', 'application/vnd.ms-excel', '.doc', 'application/msword',
].join(',')

const ext = (name) => (String(name).match(/\.([a-z0-9]+)$/i)?.[1] || '').toLowerCase()

export function fileKind(file) {
  const e = ext(file.name)
  if (file.type === 'application/pdf' || e === 'pdf') return 'pdf'
  if (['csv', 'tsv', 'txt'].includes(e) || file.type === 'text/csv' || file.type === 'text/plain') return 'text'
  if (e === 'xlsx') return 'xlsx'
  if (e === 'docx') return 'docx'
  if (['numbers', 'pages', 'key'].includes(e)) return 'apple'
  if (['xls', 'doc'].includes(e)) return 'old-office'
  if (file.type.startsWith('image/') || ['jpg', 'jpeg', 'png', 'heic', 'heif', 'webp'].includes(e)) return 'image'
  return 'unknown'
}

// Shown instead of reading. Kept short enough for a phone sheet.
export function cantReadMessage(kind, name) {
  if (kind === 'apple') {
    return `Daybook can't open ${/\.pages$/i.test(name) ? 'Pages' : 'Numbers'} files directly. ` +
      'Open the file in its app, tap ••• (or Share), then Export, and pick Excel or PDF. Then choose the exported file here.'
  }
  if (kind === 'old-office') {
    return 'That is an older Office file. Open it and save it as a newer Excel (.xlsx) or Word (.docx) file, or as a PDF, then choose that file here.'
  }
  return 'Daybook can read photos, PDFs, Excel (.xlsx), Word (.docx), CSV and text files. Save your log as one of those and try again.'
}

// A spreadsheet cell as the person typed it. Excel stores dates without a time
// zone, and the reader hands them back as UTC, so format them in UTC. A cell
// holding only a time ("2:30 PM") is stored as that time on Excel's day zero,
// 30 December 1899, so it comes back as just the time.
function cell(v) {
  if (v == null) return ''
  if (v instanceof Date) {
    const iso = v.toISOString()
    const day = iso.slice(0, 10)
    const time = iso.slice(11, 16)
    if (day === '1899-12-30' || day === '1899-12-31') return time
    return time === '00:00' ? day : `${day} ${time}`
  }
  return String(v).replace(/\s+/g, ' ').trim()
}

async function xlsxText(file) {
  const { default: readXlsxFile } = await import('read-excel-file/browser')
  const sheets = await readXlsxFile(file)
  return sheets
    .map(({ sheet, data }) => {
      const rows = data
        .map((r) => r.map(cell))
        .filter((r) => r.some(Boolean))
        .map((r) => r.join(' | '))
      return rows.length ? `## Sheet: ${sheet}\n${rows.join('\n')}` : ''
    })
    .filter(Boolean)
    .join('\n\n')
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }

// A .docx is a zip; its words are in word/document.xml. Keep paragraphs, tabs
// and table cells apart so a journal laid out as a table stays readable.
async function docxText(file) {
  const { unzipSync, strFromU8 } = await import('fflate')
  const files = unzipSync(new Uint8Array(await file.arrayBuffer()), {
    filter: (f) => f.name === 'word/document.xml',
  })
  const xml = files['word/document.xml']
  if (!xml) throw new Error('not a Word document')
  return strFromU8(xml)
    .replace(/<w:tab\/>/g, '\t')
    .replace(/<w:br\/>/g, '\n')
    // A table row is one line, its cells split by " | " like a spreadsheet's.
    .replace(/<\/w:p>\s*<\/w:tc>/g, '</w:tc>')
    .replace(/<\/w:tc>/g, ' | ')
    .replace(/<\/w:tr>/g, '\n')
    .replace(/<\/w:p>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&(amp|lt|gt|quot|apos);/g, (_, k) => ENTITIES[k])
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/ \| *\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

// -> { text, truncated } for text-like files.
export async function fileToText(file, kind) {
  let text
  if (kind === 'text') text = await file.text()
  else if (kind === 'xlsx') text = await xlsxText(file)
  else if (kind === 'docx') text = await docxText(file)
  else throw new Error(`not a text kind: ${kind}`)
  text = text.replace(/\r\n?/g, '\n').trim()
  return { text: text.slice(0, MAX_CHARS), truncated: text.length > MAX_CHARS }
}
