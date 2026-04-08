# 🚀 Démarrage Rapide - Bot Twitter SaaS

## Démarrer tous les services

### Terminal 1 - Database & Redis (Docker)
```bash
cd d:\SAAS
docker-compose up -d db redis
```

### Terminal 2 - Backend API
```bash
cd d:\SAAS\backend
npm run dev
```

### Terminal 3 - Worker
```bash
cd d:\SAAS\worker
npm run dev
```

### Terminal 4 - Frontend
```bash
cd d:\SAAS\frontend
npm run dev
```

## Accéder aux services

- **Frontend Dashboard**: http://localhost:3000
- **Backend API**: http://localhost:4000
- **Health Check**: http://localhost:4000/health

---

## ✨ Nouvelles Fonctionnalités

### 1. Publications Planifiées
- Créer des tweets à l'avance
- Le bot les publie automatiquement à l'heure prévue
- File d'attente gérée par BullMQ

### 2. Statistiques en Temps Réel
- Tweets publiés (quotidien & total)
- Likes donnés/reçus
- Retweets donnés/reçus
- Replies donnés/reçus
- Followers/Following count
- Profile views
- Engagement rate

### 3. Dashboard Amélioré
- Guide intégré pour récupérer le auth_token
- Interface de création de posts
- Visualisation des statistiques (à venir)

---

## 📊 API Endpoints

### Posts
- `POST /api/twitter-posts` - Créer un tweet planifié
- `GET /api/twitter-posts/:accountId` - Liste des posts
- `PATCH /api/twitter-posts/:postId/stats` - Mettre à jour les stats

### Statistiques
- `GET /api/twitter-stats/:accountId?days=30` - Stats détaillées

### Actions
- `POST /api/twitter-accounts/:id/action` - Lancer une action (warmUp, autoPost, etc.)

---

## 🎯 Exemple d'utilisation

### Créer un tweet planifié
```javascript
fetch('http://localhost:4000/api/twitter-posts', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    accountId: 'your-account-id',
    content: 'Mon super tweet! 🚀',
    scheduleDate: '2024-04-08T10:00:00Z' // Optionnel - maintenant si absent
  })
})
```

### Récupérer les statistiques
```javascript
fetch('http://localhost:4000/api/twitter-stats/your-account-id?days=7')
  .then(res => res.json())
  .then(data => console.log(data))
```

---

## 🔧 Base de données

### Migration
```bash
cd d:\SAAS\backend
npx prisma db push
```

### Reset (⚠️ Perd toutes les données)
```bash
npx prisma migrate reset
```

---

## 📝 Notes

- Les stats sont mises à jour automatiquement après chaque action
- Les posts planifiés sont ajoutés à la file d'attente BullMQ
- Le worker traite les jobs et met à jour les stats en temps réel
- Socket.io diffuse les logs et screenshots au frontend
