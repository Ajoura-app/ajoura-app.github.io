# MapLibre GL JS 6.18.0

Kartta-välilehden karttakirjasto (AJOURA 2.25). Lisenssi BSD-3-Clause (LICENSE.txt).

- Lähde: npm-paketti `maplibre-gl@6.18.0`, kansio `dist/` (tiedostot muuttamattomina, lähdekarttoja ei mukana).
- npm-tarkiste: `sha512-8ucT+RhJtEZGFvWGPioVQwvOPMAIuUehEgxl2dELw9aJmX4SpUi+OCHHAD33B9EuohNC7kC/gccJacUgTMQfQQ==`
- Tiedostojen SHA-256: SHA256SUMS.
- Ladataan vasta, kun Kartta avataan (kartta.js). Versio 6 on ES-moduuli ja vaatii WebGL2:n.
  Varalla 5.24.1 (UMD-skripti), jos ES-moduuli ei toimi iPhonen kotivalikon sovelluksessa.
- Offline-osa (sw.js) ei asenna näitä etukäteen; ne tallentuvat ensimmäisellä käytöllä.
