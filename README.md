# Mojito Inn

Mojito Inn est une application web de gestion interne pour un bar roleplay. Elle centralise les ventes, l’ardoise partagée, le suivi de l’équipe, les réservations et les animations dans une interface adaptée aux ordinateurs comme aux téléphones.

## Fonctionnalités

- Enregistrement des ventes en commande simple ou directement sur l’ardoise commune.
- Carte simplifiée ou détaillée, tarifs Happy Hour, panier et montant libre.
- Saisie vocale des commandes, avec vérification avant validation et synonymes personnalisés.
- Solde, historique des opérations et statistiques de l’équipe synchronisés en temps réel.
- Suivi des dépenses, réapprovisionnements, cadeaux et inventaires des camions.
- Ouverture et clôture des services, statistiques par vendeur, historique et export CSV.
- Comptes employés avec demande d’accès, validation par un administrateur et journal d’activité détaillé.
- Planning hebdomadaire pour la petite salle, les escapades romantiques et les locations nautiques.
- Gestion des animations : quiz, blind tests, tombola et tournoi chronométré de Jet-Ski.
- Classements sauvegardés et podium hebdomadaire des ardoises.
- Génération locale d’une vidéo du podium, puis publication sur StoryUpload.
- Bibliothèque partagée de cocktails, phrases d’ouverture, images, vidéos et playlists.
- Recherche globale dans les ventes, dépenses, cadeaux, jeux et services.
- Installation en PWA, modes clair et sombre, plein écran et économie de batterie.

## Technologies utilisées

- **HTML5, CSS3 et JavaScript** sans framework front-end.
- **Supabase** pour PostgreSQL, l’authentification, le temps réel, le stockage et les fonctions serveur.
- **TypeScript et Deno** pour les Edge Functions Supabase.
- **Service Worker et Web App Manifest** pour l’installation en PWA et la gestion des mises à jour.
- **Canvas, Web Workers, OffscreenCanvas et WebCodecs** pour le rendu vidéo du podium.
- **MP4Box.js et WebM Muxer** pour le décodage et l’encodage vidéo dans le navigateur.
- **StoryUpload** pour l’hébergement des vidéos générées.

## Installation et utilisation

Le front-end ne demande ni installation de dépendances ni compilation. Il doit simplement être servi par un serveur HTTP. Avec Node.js installé :

```bash
git clone https://github.com/Povikk/mojitoinnpaleto.git
cd mojitoinnpaleto
npx --yes serve . -l 8000
```

L’application est ensuite disponible à l’adresse [http://localhost:8000](http://localhost:8000).

Une connexion employé approuvée est nécessaire pour accéder aux données. Le fichier `config.js` contient l’URL du projet Supabase et sa clé publique. Pour utiliser une autre instance, il faut remplacer ces valeurs puis adapter les scripts SQL présents à la racine et les fonctions du dossier `supabase/functions` au projet Supabase cible.

Un navigateur récent est recommandé. La saisie vocale et la génération vidéo dépendent des API prises en charge par le navigateur ; Chrome ou Edge offrent la compatibilité la plus complète.

## Auteur

**Jonathan Ragot**\
GitHub : [Povikk](https://github.com/Povikk)
