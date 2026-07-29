# Captures d'écran du mode d'emploi

Ce dossier contient les **captures d'écran** affichées dans le mode d'emploi du CRM
(page « 📖 Mode d'emploi » et aide contextuelle « ❓ »).

## Comment ça marche

Dans `index.html`, chaque section du tableau `MODE_EMPLOI` peut porter un champ `visuels` :

```js
visuels:[
  { src:'assets/help/dashboard.png', legende:"Tableau de bord — vue d'ensemble." },
]
```

- Si le fichier **existe**, l'image s'affiche (avec sa légende) dans le mode d'emploi et dans l'export PDF.
- S'il **n'existe pas**, la figure est **masquée automatiquement** (pas d'image cassée). Tu peux donc ajouter les captures au fur et à mesure.

Les schémas vectoriels (SVG) déjà intégrés au code (champ `schema`) restent affichés en attendant les vraies captures.

## Fichiers attendus (déjà référencés dans le code)

| Fichier | Écran à capturer |
|---|---|
| `dashboard.png` | Tableau de bord (barre de filtres + KPIs + objectifs par agence) |
| `opportunites-kanban.png` | Opportunités — vue Pipeline (Kanban) |
| `fiche-client.png` | Fiche société (blocs Informations / Commerce / Contacts…) |
| `carte-opportunites.png` | Carte des opportunités (veille terrain) |

## Ajouter une capture

1. Fais la capture (PNG de préférence, largeur ~1000–1400 px, poids raisonnable).
2. Dépose-la ici avec **exactement** le nom attendu ci-dessus.
3. Recharge le CRM (Ctrl+F5) : l'image apparaît dans le mode d'emploi.

## Ajouter un NOUVEAU visuel sur une autre section

Dans `index.html`, sur la section voulue du tableau `MODE_EMPLOI`, ajoute un champ `visuels` :

```js
{ key:'taches', /* … */, visuels:[
  { src:'assets/help/taches.png', legende:"Vue Pipeline des tâches." },
]},
```

puis dépose `assets/help/taches.png`.

> Astuce : les chemins sont relatifs à la racine du site (déployée sur Vercel), donc `assets/help/<fichier>.png` fonctionne aussi bien dans l'application que dans la fenêtre d'impression / PDF.
