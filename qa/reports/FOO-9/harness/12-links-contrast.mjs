import { browser, newPage, BUILD, VIEWPORTS, settle } from './lib.mjs'

const b = await browser()
const ok = (c) => (c ? 'PASS' : '** FAIL **')

/* ---- Every link / anchor target ---- */
{
  console.log('================ LINKS & ANCHORS ================')
  const page = await newPage(b, { viewport: VIEWPORTS[1440] })
  await page.goto(BUILD)
  await settle(page)
  const links = await page.evaluate(() => {
    const out = []
    for (const a of document.querySelectorAll('a[href]')) {
      const href = a.getAttribute('href')
      const where = a.closest('.foot') ? 'footer' : a.closest('.nav') ? 'nav' : 'body'
      let resolves = null
      if (href.startsWith('#')) resolves = href === '#' ? false : Boolean(document.querySelector(href))
      out.push({
        where,
        text: (a.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 24),
        href,
        resolves,
        external: /^https?:/.test(href),
        target: a.getAttribute('target'),
        rel: a.getAttribute('rel'),
      })
    }
    return out
  })
  console.log('all <a> elements:')
  for (const l of links) {
    const flag = l.resolves === false ? ' ** BROKEN ANCHOR **' : ''
    console.log(`  [${l.where.padEnd(6)}] ${l.text.padEnd(26)} -> ${String(l.href).padEnd(14)} resolves=${l.resolves}${flag}`)
  }
  const broken = links.filter((l) => l.resolves === false)
  console.log('\nbroken anchors:', broken.length ? JSON.stringify(broken) : 'none', ok(broken.length === 0))
  const placeholderTop = links.filter((l) => l.href === '#top' && l.where === 'footer')
  console.log(`footer links pointing at #top (i.e. go nowhere useful): ${placeholderTop.length} — ${placeholderTop.map((l) => l.text).join(', ')}`)
  console.log('external links:', links.filter((l) => l.external).length)

  const legal = await page.evaluate(() => {
    const el = [...document.querySelectorAll('.foot__base span')].find((s) => /PRIVACY/.test(s.textContent))
    return { text: el?.textContent.trim(), linkCount: el?.querySelectorAll('a').length }
  })
  console.log('legal line:', JSON.stringify(legal), legal.linkCount === 0 ? '(plain text, not links)' : '')

  // Does "WhatsApp us" exist as a real contact anywhere?
  const wa = await page.evaluate(() =>
    [...document.querySelectorAll('a[href]')].filter((a) => /wa\.me|whatsapp|tel:|mailto:/i.test(a.getAttribute('href'))).map((a) => a.getAttribute('href')),
  )
  console.log('real WhatsApp / phone / email contact links on the page:', wa.length ? wa : 'NONE', ok(wa.length > 0))
  await page.ctx.close()
}

/* ---- Contrast of the text axe could not resolve ---- */
{
  console.log('\n================ CONTRAST (computed) ================')
  const page = await newPage(b, { viewport: VIEWPORTS[1440] })
  await page.goto(BUILD + '#book-a-demo')
  await settle(page)
  const results = await page.evaluate(() => {
    const lum = (c) => {
      const [r, g, b] = c.map((v) => {
        v /= 255
        return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
      })
      return 0.2126 * r + 0.7152 * g + 0.0722 * b
    }
    const parse = (s) => (s.match(/[\d.]+/g) || []).slice(0, 3).map(Number)
    const ratio = (a, b) => {
      const [l1, l2] = [lum(a), lum(b)].sort((x, y) => y - x)
      return (l1 + 0.05) / (l2 + 0.05)
    }
    // Walk up for the first non-transparent background.
    const bgOf = (el) => {
      for (let e = el; e; e = e.parentElement) {
        const bg = getComputedStyle(e).backgroundColor
        if (bg && !/rgba\(0, 0, 0, 0\)|transparent/.test(bg)) return parse(bg)
      }
      return [255, 255, 255]
    }
    const samples = [
      ['hero h1', 'h1'],
      ['hero sub', '.hero__sub'],
      ['hero tag', '.hero__tags li'],
      ['sticker', '.sticker'],
      ['section lede', '.lede'],
      ['feature body', '.card p'],
      ['feature tag', '.card ul li'],
      ['ai card body (unselected)', '.aicard:not(.is-on) p'],
      ['ai card body (selected)', '.aicard.is-on p'],
      ['ai lede on indigo', '.ai .lede'],
      ['who body', '.who__c p'],
      ['faq summary', '.faq summary'],
      ['faq answer', '.faq p'],
      ['stat label', '.stat span'],
      ['placeholder chip', '.ph'],
      ['footer link', '.foot a'],
      ['footer about', '.foot__about'],
      ['footer legal', '.foot__base'],
      ['form label', '.field__label'],
      ['form hint', '.field__hint'],
      ['form error', '.field__err'],
      ['form fine print', '.form__fine'],
      ['modal intro', '.modal__head p'],
      ['tag--ok', '.tag--ok'],
      ['placeholder text in input', 'input[name=phone]'],
    ]
    const out = []
    for (const [label, sel] of samples) {
      const el = document.querySelector(sel)
      if (!el) { out.push({ label, sel, missing: true }); continue }
      const cs = getComputedStyle(el)
      const fg = parse(cs.color)
      const bg = bgOf(el)
      const size = parseFloat(cs.fontSize)
      const weight = Number(cs.fontWeight) || 400
      const large = size >= 24 || (size >= 18.66 && weight >= 700)
      const r = ratio(fg, bg)
      out.push({
        label, size: size.toFixed(1), weight, large,
        ratio: r.toFixed(2),
        need: large ? 3 : 4.5,
        pass: r >= (large ? 3 : 4.5),
        fg: cs.color, bg: `rgb(${bg.join(', ')})`,
      })
    }
    return out
  })
  let fails = 0
  for (const r of results) {
    if (r.missing) { console.log(`  (not found) ${r.label} ${r.sel}`); continue }
    const mark = r.pass ? 'ok  ' : '** FAIL **'
    if (!r.pass) fails++
    console.log(`  ${mark} ${r.label.padEnd(28)} ${r.ratio.padStart(6)}:1 (need ${r.need}) ${String(r.size).padStart(5)}px/${r.weight}  fg=${r.fg} bg=${r.bg}`)
  }
  console.log(`\ncontrast failures: ${fails}`, ok(fails === 0))
  await page.ctx.close()
}

await b.close()
