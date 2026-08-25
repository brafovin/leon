# Forza Horizon 6 🏁

Ein 3D-Open-World-Rennspiel im Stil von Forza Horizon – komplett im Browser, ohne
Build-Schritt und ohne Installation. Fünf handgemachte Festival-Welten, prozedural
erzeugtes Gelände, Arcade-Fahrphysik mit Drift und Boost – und als Startwagen
natürlich ein **BMW M5 Competition**.

![Three.js](https://img.shields.io/badge/Three.js-r161-000?logo=three.js)
![No build step](https://img.shields.io/badge/Build-keiner-brightgreen)

## Starten

```bash
node server.mjs        # oder: npm start
```

Dann <http://localhost:8080> im Browser öffnen. Jeder andere statische Server geht
genauso (`python3 -m http.server`, `npx http-server` …) – nur direkt per
`file://` funktioniert es nicht, weil ES-Module über HTTP geladen werden müssen.

## Die fünf Welten

| # | Welt | Charakter |
|---|------|-----------|
| 1 | **Horizon Bay** | Mediterrane Küste, Klippen, Palmen, türkisblaues Meer |
| 2 | **Alpen Gipfel** | Hochgebirge mit Schneefall, Serpentinen, Nadelwald |
| 3 | **Neon City** | Nachtrennen im Regen zwischen Hochhäusern und Neonlicht |
| 4 | **Sahara Dünen** | Dünenmeer im Sandsturm bei Sonnenuntergang |
| 5 | **Tropen Insel** | Vulkaninsel mit Lagune und Sonnenaufgang über dem Riff |

Jede Welt hat ein eigenes Höhenprofil, eigene Licht- und Nebelstimmung, eigenes
Wetter, eigene Vegetation und eine eigene, prozedural erzeugte Rundstrecke mit
12 Checkpoints.

## Steuerung

| Taste | Funktion |
|-------|----------|
| `W` / `↑` | Gas |
| `S` / `↓` | Bremse & Rückwärtsgang |
| `A` `D` / `←` `→` | Lenken |
| `Leertaste` | Handbremse (Drift) |
| `Shift` | Boost |
| `Enter` | Rennen starten (2 Runden gegen 3 KI-Gegner) |
| `C` | Kamera: Verfolger / Weit / Cockpit / Kino |
| `R` | Auto auf die Strecke zurücksetzen |
| `M` | Sound an/aus |
| `Esc` | Pause / Festival-Menü |

Ein Gamepad wird ebenfalls unterstützt (RT = Gas, LT = Bremse, linker Stick = Lenkung,
A = Handbremse, B = Boost).

## Spielinhalt

* **Freie Fahrt** in jeder Welt – die komplette 1,9 × 1,9 km große Karte ist befahrbar.
* **Rennen** über zwei Runden gegen drei KI-Gegner, mit Platzierung, Rundenzeiten und Bestzeit-Speicherung.
* **Skill-Punkte** für lange Drifts und weite Sprünge werden direkt in Credits umgerechnet.
* **Garage** mit sieben Fahrzeugen: BMW M5 (Start), BMW M3 Touring, Ford Mustang GT,
  Toyota GR Supra, Porsche 911 GT3, Lamborghini Huracán und Bugatti Chiron.
  Alle Fahrleistungen (Vmax, 0–100, Bremsweg, Antriebsart) sind in der Physik hinterlegt.
* Fortschritt (Credits, Fahrzeuge, Bestzeiten) wird im `localStorage` gespeichert.

## Technik

Reines JavaScript mit ES-Modulen, gerendert über [Three.js](https://threejs.org)
(lokal in `vendor/` abgelegt, damit das Spiel auch offline läuft).

```
index.html          Menü, HUD, Overlays
style.css           komplettes UI
server.mjs          winziger statischer Server
src/
  main.js           Menü, Spielstand, Ablaufsteuerung
  game.js           Szene, Kamera, Rennlogik, Partikel, Qualitätsautomatik
  worlds.js         Definition der fünf Welten (Höhenfunktion, Licht, Farben)
  track.js          prozedurale Rundstrecke (Spline, Asphalt, Leitpfosten)
  terrain.js        Höhenfeld, eingeebnet entlang der Straße, Vertex-Farben, Wasser
  props.js          Vegetation & Hochhäuser als InstancedMesh + Kollision
  cars.js           Fahrzeugdaten und Karosseriebau aus Silhouetten
  physics.js        Fahrphysik (Gänge, Grip, Drift, Sprünge) und KI-Gegner
  sky.js            Himmels-Shader, Sterne, Regen/Schnee/Sand
  hud.js            Tacho und Minimap auf 2D-Canvas
  input.js          Tastatur & Gamepad
  audio.js          synthetischer Motor-, Reifen- und Windsound (WebAudio)
```

Bemerkenswerte Details:

* **Gelände & Straße passen zusammen:** Die Strecke wird zuerst als Spline erzeugt,
  ihre Höhe geglättet, und anschließend wird das Höhenfeld im Umkreis von 20 m
  weich auf Straßenniveau gezogen.
* **Fahrphysik:** Längs- und Querkräfte werden getrennt berechnet; Gänge, Drehmomentkurve,
  Luft- und Rollwiderstand sind so abgestimmt, dass jedes Auto seine angegebene
  Höchstgeschwindigkeit tatsächlich erreicht (M5: 302 km/h gemessen, 0–100 in 2,8 s).
* **Kein einziges Asset:** Autos, Bäume, Häuser, Himmel, Reflexionen und Sound
  entstehen zur Laufzeit im Code.
* **Qualitätsautomatik:** Sinkt die Bildrate, werden Auflösung, Schatten und
  Wetterpartikel automatisch reduziert.
