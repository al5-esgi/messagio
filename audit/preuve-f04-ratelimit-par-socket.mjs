// Preuve F-04 : le RateLimiter est par SOCKET, pas par IDENTITE.
// Une meme identite ouvre N sockets et multiplie son quota par N.
// Usage : node audit/preuve-f04-ratelimit-par-socket.mjs [nbSockets] [url]
import { io } from 'socket.io-client'
import jwt from 'jsonwebtoken'

const N = Number(process.argv[2] ?? 10)
const URL = process.argv[3] ?? 'http://localhost:3010'
const token = jwt.sign({ sub: 'alice' }, 'change-moi', { expiresIn: '1h' })

const ouvrir = () => new Promise((res, rej) => {
  const s = io(URL, { auth: { token }, transports: ['websocket'] })
  s.on('connect', () => s.emit('join', 'salon:general', () => res(s)))
  s.on('connect_error', rej)
})

const sockets = await Promise.all(Array.from({ length: N }, ouvrir))
console.log(`${sockets.length} sockets ouvertes avec LE MEME jeton (sub=alice)`)

let acceptes = 0, refuses = 0
await Promise.all(sockets.map((s) => new Promise((resolve) => {
  let repondus = 0
  for (let i = 0; i < 30; i++) {
    s.emit('message', { salonId: 'general', texte: `flood ${i}` }, (r) => {
      r?.ok ? acceptes++ : refuses++
      if (++repondus === 30) resolve()
    })
  }
  setTimeout(resolve, 3000)
})))

console.log(`messages ACCEPTES en 1 seconde : ${acceptes}  (refuses : ${refuses})`)
console.log(`quota annonce par socket : 15/s  ->  quota effectif pour cette identite : ${acceptes}`)
sockets.forEach((s) => s.close())
process.exit(0)
