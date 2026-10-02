import kalamUrl from '@fontsource/kalam/files/kalam-latin-400-normal.woff2?url'
import interUrl from '@fontsource-variable/inter/files/inter-latin-wght-normal.woff2?url'

let fontCss: Promise<string> | null = null

async function asDataUrl(url: string): Promise<string> {
  const blob = await (await fetch(url)).blob()
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

/** An SVG rendered as an <img> cannot load external fonts, so inline them as data URIs. */
function embeddedFonts() {
  fontCss ??= Promise.all([asDataUrl(kalamUrl), asDataUrl(interUrl)]).then(
    ([kalam, inter]) =>
      `@font-face{font-family:'Kalam';font-weight:400;src:url(${kalam}) format('woff2');}` +
      `@font-face{font-family:'Inter Variable';font-weight:100 900;src:url(${inter}) format('woff2');}`,
  )
  return fontCss
}

async function svgToJpeg(svg: SVGSVGElement, scale = 2): Promise<{ data: string; width: number; height: number }> {
  const { width, height } = svg.viewBox.baseVal
  const clone = svg.cloneNode(true) as SVGSVGElement
  clone.setAttribute('width', String(width))
  clone.setAttribute('height', String(height))
  const style = document.createElementNS('http://www.w3.org/2000/svg', 'style')
  style.textContent = await embeddedFonts()
  clone.insertBefore(style, clone.firstChild)

  const img = new Image()
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(clone))
  await img.decode()

  const canvas = document.createElement('canvas')
  canvas.width = width * scale
  canvas.height = height * scale
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
  return { data: canvas.toDataURL('image/jpeg', 0.9), width, height }
}

/** One letter-size page per daily log sheet. */
export async function exportLogsPdf(sheets: SVGSVGElement[], filename: string) {
  const { jsPDF } = await import('jspdf')
  const pdf = new jsPDF({ unit: 'pt', format: 'letter', orientation: 'portrait', compress: true })
  const pageW = pdf.internal.pageSize.getWidth()
  for (let i = 0; i < sheets.length; i++) {
    const { data, width, height } = await svgToJpeg(sheets[i])
    if (i > 0) pdf.addPage()
    const w = pageW - 40
    pdf.addImage(data, 'JPEG', 20, 24, w, (w * height) / width, undefined, 'FAST')
  }
  pdf.save(filename)
}
