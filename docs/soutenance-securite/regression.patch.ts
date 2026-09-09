// REGRESSION DE DEMONSTRATION - soutenance S10. A NE JAMAIS FUSIONNER.
//
// Charge volontairement GENERIQUE : des chaines a haute entropie affectees a des variables
// dont le nom contient un mot-cle de secret. gitleaks les detecte via sa regle
// `generic-api-key`. On evite deliberement les motifs de fournisseur (ghp_..., sk_live_...) :
// la *push protection* de GitHub les bloquerait AVANT que les Actions ne demarrent, et la
// demonstration ne pourrait pas avoir lieu.
export const DEPLOY_API_KEY = 'Xq7RmZ2vTb9KcLd4WpH6yNaE3JsUf8gViQoR1BnDtMwZ'
export const SESSION_SECRET_KEY = 'Kv3PjX8mQz5RtYw2LcHn7BdFa4GsUe9NiMoZ1TrWpXbV'
