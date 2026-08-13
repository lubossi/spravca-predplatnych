# 💳 Správca predplatných (Subscription Manager)

Moderná, rýchla a responzívna webová aplikácia v slovenčine na sledovanie pravidelných platieb, výpočet celkových mesačných/ročných výdavkov, plánovanie úspor a notifikácie nadchádzajúcich platieb.

---

## 🌟 Hlavné funkcie
- **Dark Mode & Glassmorphism UI**: Špičkový tmavý dizajn s efektom rozostrenia skla (`backdrop-filter: blur`).
- **Dashboard & Metriky**: Okamžitý prehľad o celkových mesačných a ročných výdavkoch, kategóriách a najbližších platbách.
- **Správa predplatných**: Vyhľadávanie, filtrovanie podľa kategórií, zoradenie a úprava/mazanie služieb.
- **Interaktívna Kalkulačka úspor ("Čo ak...")**: Zvoľte služby na zrušenie a aplikácia prepočíta ušetrené financie s vizuálnymi míľnikmi (dovolenka, nový mobil, pobyt).
- **Upozornenia & Notifikácie**: Prehľad platieb splatných v najbližších dňoch.
- **Export & Zálohovanie**: Stiahnutie zoznamu vo formáte CSV (pre MS Excel) alebo JSON záloha pre prenos medzi zariadeniami.
- **Ukladanie dát**: Fyzické ukladanie na disk (`data/subscriptions.json`) pri spustenom lokálnom serveri alebo `localStorage` pri bezplatnom webovom nasadení.

---

## 🚀 Návod na bezplatné nasadenie (Deployment)

Aplikácia je navrhnutá tak, aby fungovala **100% samostatne v akomkoľvek prehliadači**, bez nutnosti spusteného backendu alebo Antigravity. Môžete ju jednoducho nasadiť zadarmo a získate vlastnú URL adresu.

### ⚡ Možnosť 1: Nasadenie na Vercel (Najjednoduchšie - 1 minúta)

[Vercel](https://vercel.com) poskytuje bezplatný hosting pre webové aplikácie s vlastnou URL adresou (napr. `spravca-predplatnych.vercel.app`).

#### Postup A (Cez Drag & Drop / CLI):
1. Vytvorte si bezplatný účet na [vercel.com](https://vercel.com).
2. Nahláste sa a kliknite na **Add New Project**.
3. Pripojte váš GitHub repozitár (alebo nainštalujte Vercel CLI prkazom `npm i -g vercel` a spustite `vercel` v priečinku projektu).
4. Kliknite na **Deploy**. Vercel automaticky rozpozná projekt a vygeneruje vám vašu unikátnu webovú adresu!

---

### 🌐 Možnosť 2: Nasadenie na GitHub Pages (Zadarmo)

Ak používate GitHub, môžete aplikáciu publikovať priamo cez GitHub Pages.

#### Postup:
1. Vytvorte nový repozitár na [GitHub.com](https://github.com) s názvom `spravca-predplatnych`.
2. Nahrajte súbory projektu do repozitára:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin https://github.com/VASE-UZIVATELSKE-MENO/spravca-predplatnych.git
   git branch -M main
   git push -u origin main
   ```
3. V nastaveniach repozitára na GitHube (**Settings -> Pages**):
   - V časti **Source** vyberte `Deploy from a branch`.
   - V časti **Branch** vyberte `main` a priečinok `/ (root)`.
   - Kliknite na **Save**.
4. Po 1-2 minútach bude vaša aplikácia dostupná na adrese:  
   `https://VASE-UZIVATELSKE-MENO.github.io/spravca-predplatnych/`

---

### 💻 Možnosť 3: Lokálne spustenie na počítači

Ak chcete aplikáciu používať lokálne na počítači s ukladávaním do súboru `data/subscriptions.json`:

```bash
# Spustenie cez Python 3 (macOS / Linux / Windows)
python3 server.py

# Alebo cez Node.js
node server.js
```
Aplikácia bude dostupná na adrese **http://localhost:3005**.

---

## 🔒 Súkromie a Ukladanie Dát v Online Verzii

Keď aplikáciu používate na Vercel alebo GitHub Pages:
- Všetky vaše zadané predplatné sa ukladajú **výhradne vo vašom prehliadači** (`localStorage`).
- Žiadne dáta sa neposielajú na žiadny externý server – aplikácia je 100% súkromná a bezpečná.
- Svoje dáta si môžete kedykoľvek **zálohovať (JSON/CSV)** v sekcii *Export a záloha* a jednoducho ich preniesť do druhého prehliadača alebo zariadenia.
