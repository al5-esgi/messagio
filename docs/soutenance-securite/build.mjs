import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// Meme dispositif que docs/soutenance/build.mjs : une presentation reveal.js AUTONOME,
// CSS et JS inlines, ni CDN ni serveur le jour de la soutenance.
//   node docs/soutenance-securite/build.mjs

const ICI = dirname(fileURLToPath(import.meta.url))
const REVEAL = join(ICI, '..', '..', 'node_modules', 'reveal.js', 'dist')
const lire = (p) => readFileSync(p, 'utf8')

/** Reveal pose `display: block` en inline sur la slide courante : on enveloppe le contenu
 *  (tout sauf les notes) dans un conteneur que le theme centre verticalement. */
function envelopper(slides) {
  return slides.replace(
    /(<section\b[^>]*>)([\s\S]*?)(<aside class="notes">[\s\S]*?<\/aside>\s*)?(<\/section>)/g,
    (_, ouverture, corps, notes = '', fermeture) =>
      `${ouverture}<div class="contenu">${corps.trim()}</div>${notes}${fermeture}`,
  )
}

const sortie = join(ICI, '..', 'soutenance-securite.html')
writeFileSync(
  sortie,
  lire(join(ICI, 'gabarit.html'))
    .replace('/*RESET*/', lire(join(REVEAL, 'reset.css')))
    .replace('/*REVEAL_CSS*/', lire(join(REVEAL, 'reveal.css')))
    .replace('/*THEME*/', lire(join(ICI, '..', 'soutenance', 'theme.css')))
    .replace('/*THEME_SECU*/', lire(join(ICI, 'theme-securite.css')))
    .replace('<!--SLIDES-->', envelopper(lire(join(ICI, 'slides.html'))))
    .replace('/*REVEAL_JS*/', lire(join(REVEAL, 'reveal.js'))),
)
console.log('ecrit : docs/soutenance-securite.html')
