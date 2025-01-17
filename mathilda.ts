import { Application, Router, Status } from 'https://deno.land/x/oak@v10.5.1/mod.ts'
import { DOMParser, HTMLDocument } from 'https://deno.land/x/deno_dom@v0.1.22-alpha/deno-dom-wasm.ts';
import { CORS } from 'https://deno.land/x/oak_cors@v0.1.0/mod.ts';
import { Html5Entities } from "https://deno.land/x/html_entities@v1.0/mod.js";

let cache: Map<string, string> = new Map()

async function cfetch(url: string, lang: string): Promise<string> {
  if (cache.has(lang + url)) {
    return cache.get(lang + url) ?? ''
  } else {
    let text = await (await fetch(
      url,
      {
        headers: {
          'Accept-Language': lang,
        }
      }
    )).text()
    cache.set(lang + url, text)
    return text
  }
}

function getMeta(document: HTMLDocument, name: string) : string | undefined {
  const byName = document.querySelector(`meta[name=\"${name}\"]`)?.outerHTML.match(/content=\\?"(.*?)\\?"/)?.[1]
  const byProperty = document.querySelector(`meta[property=\"${name}\"]`)?.outerHTML.match(/content=\\?"(.*?)\\?"/)?.[1]
  return byName ?? byProperty
}

const router = new Router()

router.get("/", (ctx) => {
  ctx.response.body = {
    message: 'General API for https://wishlily.app/',
    success: true,
  }
})

router.get("/etsy/search", async (ctx) => {
  try {
    const lang = ctx.request.headers.get('Accept-Language')
    const query = ctx.request.url.searchParams.get('q')
    const results = await cfetch(`https://etsy.com/search?q=${query}`, lang ?? 'en-US,en;q=0.5')
    const document: any = new DOMParser().parseFromString(results, 'text/html');
    const links = document.getElementsByClassName('v2-listing-card')

    let resultsJSON = []
    for (let link of links) {
      const productinfo = link.getElementsByClassName("v2-listing-card__info")[0]
      let title = productinfo.getElementsByClassName('v2-listing-card__title')[0].textContent.replace('\\n', '').trim()
      let cover = link.getElementsByClassName('wt-width-full')[0].outerHTML.match(/src="(.*?)"/)[1]
      let price = productinfo.getElementsByClassName("currency-symbol")[0].textContent + productinfo.getElementsByClassName("currency-value")[0].textContent
      let buyLink = link.outerHTML.match(/href="(.*?)\?.*?"/)[1]

      resultsJSON.push({
        title,
        price,
        cover,
        link: buyLink,
        id: buyLink.match(/.*?listing\/(.*)/)[1]
      })
    }

    ctx.response.body = {
      message: resultsJSON,
      success: true,
    }
  } catch (e) {
    console.log(e)
    ctx.response.body = {
      message: 'Internal error occurred.',
      success: false,
    }
    ctx.response.status = Status.InternalServerError
  }
})

router.get("/etsy/product", async (ctx) => {
  const id = ctx.request.url.searchParams.get('id')
  try {
    const lang = ctx.request.headers.get('Accept-Language')
    const results = await cfetch(`https://etsy.com/listing/${id}`, lang ?? 'en-US,en;q=0.5')

    const document: any = new DOMParser().parseFromString(results, 'text/html');
    const description = document.getElementById('listing-page-cart')
    const cover = document.querySelector('img.wt-max-width-full').outerHTML.match(/src=\\?"(.*?)\\?"/)[1]
    const title = description.getElementsByClassName('wt-text-body-03')[0].textContent.replace('\\n', '').trim()
    const price = description.getElementsByClassName('wt-mr-xs-2')[0].textContent.replaceAll('\\n', '').replaceAll('Price:', '').replace(/\s+/g, ' ').trim()

    ctx.response.body = {
      title: Html5Entities.decode(title),
      price: Html5Entities.decode(price),
      cover,
      link: `https://etsy.com/listing/${id}`,
      success: true,
    }

  } catch (e) {
    console.log(e)
    ctx.response.body = {
      message: 'Internal error occurred.',
      success: false,
    }
    ctx.response.redirect(`https://proxy.wishlily.app/generic/product?keep=true&id=https://etsy.com/listing/${id}`)
    ctx.response.status = Status.InternalServerError
  }
})

router.get("/amazon/search", async (ctx) => {
  try {
    const lang = ctx.request.headers.get('Accept-Language')
    const query = ctx.request.url.searchParams.get('q')?.replace(' ', '+')
    const results = await cfetch(`https://amazon.com/s?k=${query}`, lang ?? 'en-US,en;q=0.5')
    const document: any = new DOMParser().parseFromString(results, 'text/html');
    const links = document.getElementsByClassName('a-section a-spacing-base')

    let resultsJSON = []
    for (let link of links) {
      const productinfo = link.getElementsByClassName('a-section a-spacing-small s-padding-left-small s-padding-right-small')[0]
      let titleEl = productinfo.getElementsByClassName('a-section a-spacing-none a-spacing-top-small s-title-instructions-style')[0]
      let title = titleEl.getElementsByClassName('a-size-base-plus a-color-base a-text-normal')[0].textContent.replace('\\n', '').trim()
      let cover = link.getElementsByClassName('s-image')[0].outerHTML.match(/src="(.*?)"/)[1]
      let price = productinfo.getElementsByClassName("a-price-symbol")[0].textContent + productinfo.getElementsByClassName("a-price-whole")[0].textContent + productinfo.getElementsByClassName("a-price-fraction")[0].textContent
      let buyLink = titleEl.getElementsByClassName('a-link-normal s-underline-text s-underline-link-text s-link-style a-text-normal')[0].outerHTML.match(/href="(.*?)\?.*?"/)[1]

      if (title && cover && price && buyLink && !buyLink.startsWith('/gp/')) {
        resultsJSON.push({
          title,
          price,
          cover: `https://imagecdn.app/v2/image/${encodeURI(cover.replace('?', ''))}?width=400&height=200&format=webp&fit=cover`,
          link: `https://amazon.com${buyLink}`.match(/(.*?)\/ref=.*/)?.[1] ?? `https://amazon.com${buyLink}`,
          id: buyLink.match(/\/?(.*?)\/ref=.*/)[1]
        })
        console.log(buyLink)
      }
    }

    ctx.response.body = {
      message: resultsJSON,
      success: true,
    }
  } catch (e) {
    console.log(e)
    ctx.response.body = {
      message: 'Internal error occurred.',
      success: false,
    }
    ctx.response.status = Status.InternalServerError
  }
})

router.get("/amazon/product", async (ctx) => {
  const id = ctx.request.url.searchParams.get('id')
  try {
    const lang = ctx.request.headers.get('Accept-Language')
    const results = await cfetch(`https://amazon.com/${id}`, lang ?? 'en-US,en;q=0.5')

    const document: any = new DOMParser().parseFromString(results, 'text/html');
    const cover = document.getElementById('landingImage').outerHTML.match(/src=\\?"(.*?)\\?"/)[1]
    const title = document.getElementById('productTitle').textContent.replace('\\n', '').trim()
    const priceEl = document.getElementsByClassName('a-price aok-align-center reinventPricePriceToPayMargin priceToPay')[0]
    let price: string = '???'
    if (priceEl) {
      price = priceEl.getElementsByClassName("a-price-symbol")[0].textContent + priceEl.getElementsByClassName("a-price-whole")[0].textContent + priceEl.getElementsByClassName("a-price-fraction")[0].textContent
    } else {
      price = document.getElementsByClassName('a-price a-text-price a-size-medium apexPriceToPay')[0].getElementsByClassName('a-offscreen')[0].textContent
    }

    ctx.response.body = {
      title: Html5Entities.decode(title),
      price: Html5Entities.decode(price),
      cover,
      link: `https://amazon.com${id}`,
      success: true,
    }
  } catch (e) {
    console.log(e)
    ctx.response.redirect(`https://proxy.wishlily.app/generic/product?keep=true&id=https://amazon.com${id}`)
  }
})

router.get("/generic/product", async (ctx) => {
  try {
    const lang = ctx.request.headers.get('Accept-Language')
    const id = ctx.request.url.searchParams.get('id')
    if (id?.includes('proxy.wishlily.app') || id?.includes('deno.dev')) throw new Error('Infinite proxy loop!')

    //http://localhost:8080/generic/product?id=https://amazon.com/Victrola-Nostalgic-Bluetooth-Turntable-Entertainment/dp/B00NQL8Z16
    // Handle known link types (a little sloppy but it shouldn't really matter)
    if (ctx.request.url.searchParams.get('keep') !== 'true') {
      if (id?.includes('amazon.com')) {
        ctx.response.redirect(`https://proxy.wishlily.app/amazon/product?id=${id.match(/.*?https?:\/\/w?w?w?.?amazon\.com\/?.*?(\/dp\/[0-9A-Za-z]{10}).*/)?.[1]}`)
        return
      }
      if (id?.includes('etsy.com')) {
        ctx.response.redirect(`https://proxy.wishlily.app/etsy/product?id=${((id + '?').replace(/\/$/, "")).match(/https?:\/\/w?w?w?.?etsy\.com\/listing\/(.*?)\?.*/)?.[1]}`)
        return
      }
    }

    const results = await cfetch(`${id}`, lang ?? 'en-US,en;q=0.5')

    const document: any = new DOMParser().parseFromString(results, 'text/html');
    const cover = getMeta(document, 'og:image') ?? getMeta(document, 'twitter:image:src')
    const title = getMeta(document, 'og:title') ?? getMeta(document, 'twitter:title')
    const ogPrice = (getMeta(document, 'og:price:currency') == 'USD' ? `$${getMeta(document, 'og:price:amount')}` : undefined)
    const regexPrices = results.match(/\$[\n\\n\s\t]*?([0-9]?[0-9]?[0-9]?[0-9]?[0-9]?[0-9]\.[0-9][0-9])/g) ?? []
    let regexPrice
    console.log(regexPrices)
    for (const thep of regexPrices) {
      const thep2 = thep.replace('$', '').replace('\\', '').replace('n', '').replace('\n', '').replace(' ', '')
      if (regexPrice === undefined && thep2 !== '0.00') {
        regexPrice = thep2
      }
    }
    const price = (ogPrice === undefined || ogPrice === '$0.00') && (regexPrice !== undefined && regexPrice !== '$0.00') ? `$${regexPrice}` : ogPrice

    if(cover === undefined || title === undefined) throw new Error('Unable to parse meta.')

    ctx.response.body = {
      title: Html5Entities.decode(title),
      price: price === '$0.00' ? undefined : price,
      cover,
      link: id?.toString() ?? 'https://wishlily.app/',
      success: true,
    }
  } catch (e) {
    console.log(e)
    ctx.response.body = {
      message: 'Internal error occurred.',
      success: false,
    }
    ctx.response.status = Status.InternalServerError
  }
})

router.get('/embed', async (ctx) => {
  try {
    const userId = ctx.request.url.searchParams.get('userId')
    const wishlistId = ctx.request.url.searchParams.get('wishlistId')

    const dbResponse = await fetch('https://data.mongodb-api.com/app/wishlily-website-krmwb/endpoint/list_wishlist', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        wishlistId,
        userId
      })
    })

    const list = (await dbResponse.json() as Array<any>).reverse()

    ctx.response.redirect(list[0]?.cover.split('?')[0] + '?format=webp')
  } catch (e) {
    console.log(e)
    ctx.response.body = {
      message: 'Internal error occurred.',
      success: false,
    }
    ctx.response.status = Status.InternalServerError
  }
})

const app = new Application()
app.use(CORS())
app.use(router.routes())
app.use(router.allowedMethods())

app.addEventListener(
  'listen',
  (e) => console.log('Listening on http://localhost:8080'),
)
await app.listen({ port: 8080 })
