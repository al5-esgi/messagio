import { creerSalon, poster, messagesDepuis } from '../domain.ts'
import { SalonClient } from './convergence.exemple.ts'

// LE PIEGE de ce sujet : ordre et deduplication a la reconnexion.
//
//   npm run scenario                     -> STUB : messages en double apres un renvoi (sortie != 0)
//   npm run scenario -- --avec-strategie  -> dedup par seq : aucun doublon (sortie 0)

const avecStrategie = process.argv.includes('--avec-strategie')
const salon = creerSalon('general', 'General')
const m1 = poster(salon, 'alice', 'On se voit a 14h ?')
const m2 = poster(salon, 'bob', 'Oui parfait')

if (!avecStrategie) {
  const affichage = [m1.texte, m2.texte] // le client a affiche m1, m2
  for (const m of messagesDepuis(salon, 0)) affichage.push(m.texte) // reconnexion : renvoi de tout
  const doublons = affichage.length !== new Set(affichage).size
  console.log('affichage du stub :', affichage.join(' | '))
  console.log(doublons ? '\nDOUBLONS  <- le stub ne deduplique pas par seq' : '\nOK')
  process.exit(doublons ? 1 : 0)
} else {
  const client = new SalonClient()
  client.recevoir(m1)
  client.recevoir(m2)
  // RECONNEXION : le serveur renvoie depuis lastSeq - 2 (chevauchement volontaire)
  client.recevoirLot(messagesDepuis(salon, client.lastSeq - 2))

  console.log('affichage :', client.affiches.map((m) => `${m.seq}:${m.texte}`).join(' | '))
  const ok = client.affiches.length === 2
  console.log(ok ? '\nCONVERGE  (dedup par seq)' : '\nDIVERGE')
  process.exit(ok ? 0 : 1)
}
