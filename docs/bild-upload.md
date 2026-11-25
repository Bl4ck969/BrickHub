# Bild-Upload (BH-4, 25.11.2026)

- **Prüfung am Inhalt:** `validate_image_bytes` (image_service.py) prüft Magic Bytes (JPEG/PNG/WebP) und
  liest nur den Kopf. Pixelgrenze `MAX_IMAGE_PIXELS` = 80 MP (ungemessen, großzügig); Pillows
  `DecompressionBombWarning` wird zum Fehler. Greift zentral in `_read_file_with_limit` (alle Upload-Routen).
- **Dateinamen:** neue Dateien tragen die Set-ID (`Original - Frontcover - Hersteller - Name - 7.jpg`).
  Alte Dateien ohne ID bleiben gültig, ihre Pfade stehen in DB und Sicherungen. „Original“/„Thumbmail“ im
  Namen nicht ändern (Preview wird aus „Original“ abgeleitet).
- ⚠ Eine Wiederherstellung (append) vergibt neue Set-IDs, die Dateinamen behalten die alte ID. Zwei Sets können
  dann auf dieselbe Datei zeigen; Ersetzen prüft das nicht (offen), Löschen schon (`still_used`).
- **Set löschen:** löscht seine sechs Bilder (+ Preview) nach dem Commit, nur unter `upload_dir`, nicht,
  worauf noch ein anderes Set zeigt; leere Ordner werden entfernt. Beim Ersetzen bleiben alte Dateien ohne ID
  als Waisen liegen.
