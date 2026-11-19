# Bonus-checker

Kalender om te zien of je met geplande verlofdagen de maandelijkse omzetdrempel van een
5%-prestatiebonus nog haalt. Alles draait in de browser, er wordt niets opgeslagen op een server.

## Rekenregels
- Salaris voor de drempel = fulltime bruto maandsalaris × (uren per week ÷ 40)
- Drempel = 2,5 × dat salaris; omzet moet **hoger** zijn dan de drempel
- Bonus = 5% van de hele maandomzet
- 1× per jaar twee opeenvolgende maanden samenvoegen: drempel 5 × salaris
- Omzet = declarabele uren × uurtarief; feestdagen op werkdagen en verlof zijn niet declarabel

## Ontwikkelen
```
npm install
npm run dev
npm test
```
