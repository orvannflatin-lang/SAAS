# 📝 Guide: Configuration des Publications OnlyFans Automatiques

## ✅ Améliorations Appliquées

### **1. Correction du Bouton de Composition**
Le bot utilisait maintenant **3 stratégies** pour ouvrir la fenêtre de composition:
- ✅ Clique sur le bouton "Post" dans la sidebar
- ✅ Utilise le raccourci clavier `n`
- ✅ Navigate directement vers `x.com/compose/post`

### **2. Contenu OnlyFans Non-Explicite**
15 messages pré-configurés qui sont:
- ✅ Professionnels et attractifs
- ✅ Pas trop explicites
- ✅ Optimisés pour l'engagement
- ✅ Avec emojis appropriés

### **3. Support des Liens OnlyFans**
Le bot peut maintenant:
- ✅ Ajouter automatiquement des liens OnlyFans
- ✅ Ajouter des hashtags aléatoires
- ✅ Combiner texte + lien + hashtags

---

## 🔧 Comment Configurer Vos Liens OnlyFans

### **Option 1: Modifier le Scheduler (Automatique)**

Ouvrez le fichier: `worker/src/utils/scheduler.ts`

Trouvez cette section (ligne ~275):

```typescript
case 'autoPost':
case 'postCommunity':
    // OnlyFans promotional posts with links
    const onlyfansLinks = [
        'https://onlyfans.com/yourusername',  // ← Changez ici
        'https://onlyfans.com/another_account',  // Ajoutez plus de liens
    ];
```

**Remplacez par vos vrais liens:**

```typescript
const onlyfansLinks = [
    'https://onlyfans.com/votre_compte_1',
    'https://onlyfans.com/votre_compte_2',
    'https://onlyfans.com/votre_compte_3',
];
```

### **Option 2: Via l'API (Manuel)**

Vous pouvez lancer une action avec configuration personnalisée:

```bash
POST http://localhost:4000/api/twitter-accounts/:id/action

{
  "action": "postCommunity",
  "config": {
    "content": "New exclusive content! Check it out 🔥",
    "onlyfansUrl": "https://onlyfans.com/votre_compte",
    "hashtags": ["#exclusive", "#content", "#premium"]
  }
}
```

---

## 📊 Types de Publications

### **Messages Automatiques (15 templates)**

Le bot choisit aléatoirement parmi:

```
"New content just dropped! Check the link in bio 🔥✨"
"Exclusive photos available now! Don't miss out 💋📸"
"Thank you for all the support! More coming soon ❤️🌟"
"Behind the scenes content you'll love 😍💕"
"Special offer for my subscribers! Link below 👇🔥"
"Just posted something amazing! Go see it 😘✨"
"Your favorite content creator is live! Join now 💖"
"New photoset available! You know where to find it 📷💋"
"Feeling creative today! Check out my latest work 🎨🔥"
"Appreciate all the love! Exclusive content for you ❤️🌹"
"Weekend vibes! New content just for you 😍📸"
"Something special waiting for you... Link in bio 🔥💕"
"Thank you for 10K followers! Celebration content coming 🎉❤️"
"Can't wait to show you what I've been working on! 😘✨"
"Premium content now available! Don't miss out 💎🔥"
```

### **Hashtags Disponibles**

Le bot sélectionne 2-4 hashtags aléatoirement:

```
#contentcreator #exclusive #subscription #premium
#photography #model #lifestyle #fitness
#fashion #beauty #art #creative
```

---

## 🎯 Exemple de Tweet Final

**Avec lien OnlyFans:**

```
New content just dropped! Check the link in bio 🔥✨

https://onlyfans.com/votre_compte

#exclusive #contentcreator #premium
```

**Sans lien (juste engagement):**

```
Exclusive photos available now! Don't miss out 💋📸

#photography #model #creative
```

---

## ⚙️ Fréquence des Publications

### **Scheduler Automatique:**
- Poids par défaut: **5%** (faible pour éviter le spam)
- Intervalle minimum: **30 minutes** entre chaque exécution
- Délai aléatoire: **0-5 minutes** entre les comptes

### **Ajuster la Fréquence:**

Dans `worker/src/utils/scheduler.ts`, ligne ~228:

```typescript
{ name: 'autoPost', weight: 5 },  // ← Augmentez pour plus de posts
```

**Recommandations:**
- `weight: 5` = ~1-2 posts par jour (sécuritaire)
- `weight: 10` = ~3-4 posts par jour (modéré)
- `weight: 15` = ~5-6 posts par jour (agressif ⚠️)

---

## 🚀 Tester la Publication

### **Via le Dashboard:**
1. Sélectionnez un compte
2. Cliquez sur le menu déroulant (⋮)
3. Choisissez **"Day 3: Post Captions"**
4. Le bot va publier automatiquement

### **Via l'API:**

```bash
curl -X POST http://localhost:4000/api/twitter-accounts/VOTRE_ACCOUNT_ID/action \
  -H "Content-Type: application/json" \
  -d '{
    "action": "postCommunity",
    "config": {
      "onlyfansUrl": "https://onlyfans.com/votre_compte"
    }
  }'
```

### **Via le Script de Test:**

```bash
node test_activity_logging.js
```

---

## 📈 Voir les Résultats

### **Logs du Worker:**
```bash
docker logs saas-worker -f --tail 50
```

Vous verrez:
```
📝 Auto-Post : Publication d'un tweet...
🔘 Clicking Post button (sidebar)...
✍️ Typing: "New content just dropped! Check the link..."
🔗 Adding OnlyFans link
🚀 Posting tweet...
✅ Tweet published successfully!
```

### **Dashboard - Statistiques:**
- Onglet **Statistiques** → Tweets Posted augmentera
- Onglet **Activités** → Historique des publications

---

## ⚠️ Bonnes Pratiques

### **Pour Éviter le Ban:**
1. ✅ Limitez à 3-5 posts par jour maximum
2. ✅ Variez le contenu (le bot le fait automatiquement)
3. ✅ Ajoutez des délais entre les posts
4. ✅ Utilisez des hashtags pertinents
5. ✅ Ne spammez pas les mêmes liens

### **Contenu Recommandé:**
- ✅ Photos de qualité (sans être trop explicite)
- ✅ Messages engageants et professionnels
- ✅ Appels à l'action clairs
- ✅ Hashtags pertinents

### **À Éviter:**
- ❌ Contenu trop explicite sur Twitter
- ❌ Spammer le même lien
- ❌ Publier trop fréquemment
- ❌ Utiliser des bots pour les likes/comments en même temps

---

## 🔗 Astuce: Liens qui Apparaissent comme Vidéos

Pour que vos liens OnlyFans apparaissent avec un aperçu attractif:

1. **OnlyFans génère automatiquement des meta tags** quand vous partagez un lien
2. **Twitter affichera une carte** avec:
   - Image de profil
   - Description
   - Bouton vers OnlyFans

### **Pour optimiser l'aperçu:**
- Assurez-vous que votre profil OnlyFans est complet
- Ajoutez une photo de profil professionnelle
- Écrivez une bio attractive

---

## 📞 Support

Si la publication ne fonctionne pas:

```bash
# 1. Vérifiez les logs
docker logs saas-worker --tail 100

# 2. Vérifiez que le compte est actif
curl http://localhost:4000/api/twitter-accounts

# 3. Testez manuellement
curl -X POST http://localhost:4000/api/twitter-accounts/ACCOUNT_ID/action \
  -H "Content-Type: application/json" \
  -d '{"action": "postCommunity"}'
```

---

## ✅ Checklist de Configuration

- [ ] Modifier les liens OnlyFans dans `scheduler.ts`
- [ ] Rebuild le worker: `docker-compose up -d --build worker`
- [ ] Tester avec un post manuel
- [ ] Vérifier les logs
- [ ] Confirmer que les stats sont enregistrées
- [ ] Ajuster la fréquence si nécessaire

**Tout est prêt pour les publications automatiques OnlyFans!** 🎉
