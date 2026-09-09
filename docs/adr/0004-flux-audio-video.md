# ADR-4 : le flux audio/video pair a pair

> ADR **supplementaire**. Le template en prescrit trois (`0001`, `0002`, `0003`) et la grille
> de soutenance ne note que les deux premiers. Celui-ci existe parce que les decisions prises
> sur le flux A/V n'etaient documentees nulle part : l'ADR-1 dit seulement pourquoi WebRTC
> **n'est pas** le transport principal, l'ADR-3 ce que le canal P2P **ne garantit pas**.

## Statut
**Accepte** (etape 8), avec une reserve explicite sur le chemin media, non verifie.

## Contexte

Le sujet demande, en fin de parcours, un appel audio/video **entre deux membres d'un meme
salon**. C'est un flux de nature completement differente du chat :

| | Flux principal (chat) | Flux A/V |
|---|---|---|
| Participants | tous les membres du salon | **deux**, en tete-a-tete |
| Donnees | messages discrets, immuables | flux continu, temps reel dur |
| Perte d'un paquet | inacceptable | **preferable** a du retard |
| Duree de vie | permanente, historisee | le temps de l'appel, rien n'est garde |

La derniere ligne est celle qui decide : pour de la voix, retransmettre un paquet perdu arrive
toujours trop tard. Le chat exige la fiabilite, la visio exige la latence — deux objectifs
qu'on ne sert pas avec le meme transport.

## Options envisagees

| Option | Ce que c'est | Pourquoi ecartee |
|---|---|---|
| **Relais applicatif** (le media passe par notre serveur Socket.IO) | on encode le flux en messages | latence doublee, bande passante du serveur multipliee par le nombre d'appels, et un protocole fiable-ordonne pour un flux qui ne veut ni l'un ni l'autre |
| **SFU** (Selective Forwarding Unit) | un serveur media redistribue les flux | la bonne reponse pour des appels de groupe : chaque pair n'envoie qu'une fois. Mais c'est une infrastructure a deployer et exploiter, injustifiee pour un tete-a-tete |
| **MCU** | un serveur melange les flux en un seul | encore plus couteux, transcodage cote serveur |
| **P2P direct** (retenu) | les deux navigateurs se parlent | pas de tiers, latence minimale, cout serveur nul une fois l'appel etabli |

## Decision

**WebRTC en pair-a-pair direct, limite a deux participants, avec STUN seulement.**

**Pourquoi le P2P convient ici.** L'appel est un tete-a-tete : le maillage se reduit a une
seule connexion, et l'argument qui condamne le P2P pour le chat — N(N-1)/2 connexions, aucune
autorite centrale — ne s'applique pas. Le contenu ne transite par aucun tiers, ce qui est aussi
une propriete de confidentialite : le serveur ne peut pas ecouter un appel qu'il ne voit jamais.

**Le serveur reste indispensable, pour le signaling.** Deux navigateurs ne se connaissent pas :
il faut un tiers pour qu'ils echangent leur `offer`/`answer` (SDP) et leurs candidats ICE.
C'est tout ce que fait `socketio-server.ts` — il relaie sans lire.

**L'autorisation du signaling suit celle du salon.** `appel:rejoindre` passe par la meme
`roomAutorisee()` que la discussion. Sans ce controle, la room d'appel serait une **porte
derobee** vers un salon prive : on ne pourrait pas lire les messages, mais on pourrait joindre
ses membres. Verifie : carol est refusee sur l'appel de `#dev` comme sur son salon.

**Deux participants maximum**, applique cote serveur (`PARTICIPANTS_MAX`). Ce n'est pas une
limitation subie mais la consequence du choix : au-dela de trois ou quatre pairs, le maillage
devient intenable et il faudrait un SFU.

## Consequences

**Ce que ca donne gratuitement.** Le chiffrement : WebRTC impose DTLS-SRTP, il n'y a pas de mode
non chiffre. Et l'adaptation au reseau (bitrate, resolution) est geree par la pile du navigateur.

**Ce que ca coute — la limite principale.** **Sans serveur TURN, un appel echoue derriere un NAT
symetrique.** STUN permet seulement de decouvrir son adresse publique (candidat `srflx`) ; quand
le NAT attribue un port different par destination, cette adresse ne sert a rien et il faut un
relais TURN. Aucun n'est configure ici : sur un reseau d'entreprise ou certains reseaux mobiles,
l'appel ne s'etablira pas. C'est assume pour un projet de TP, et c'est le premier element a
ajouter pour un usage reel — au prix d'un serveur qui **relaie le flux**, donc de la propriete
« aucun tiers » que le P2P apportait.

**Ce qui n'est pas verifie.** Le chemin **media** (camera et micro) n'a pas pu etre teste faute
de camera sur la machine de developpement. Le `RTCDataChannel`, lui, est verifie de bout en bout
entre deux navigateurs. Le signaling etant identique pour les deux, le risque porte sur la
renegociation et les codecs, pas sur l'etablissement de la connexion.

**Un piege rencontre, corrige.** `createDataChannel` et `addTrack` declenchent tous deux
`onnegotiationneeded`. Emettre en plus une offre a la main faisait entrer deux negociations en
collision : `The order of m-lines in subsequent offer doesn't match order from previous
offer/answer`. Un seul endroit produit desormais les offres, et un seul pair offre — l'autre
repond.

**Aucune reprise automatique.** Un canal P2P rompu ne se repare pas : il faut renegocier. Le
serveur emet donc `appel:pair-parti` **sans delai de grace**, contrairement a la presence du
chat, pour que le pair ne reste pas devant un canal mort. Voir l'ADR-3.
