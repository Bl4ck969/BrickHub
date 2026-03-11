"""
Image processing pipeline:

Auto-Modus (Legacy):
1. Save original → 2. rembg Background-Removal → 3. Alpha-Dilatation
→ 4. Crop → 5. Weiß-Hintergrund → 6. Farbnormalisierung → 7. Skalierung → 8. Thumbnail

Semi-automatischer 2-Phasen-Workflow:
Phase 1: Upload → Auto-Corner-Detection → Manuelle Ecken-Korrektur → Perspektivkorrektur + Rotation → Preview
Phase 2: rembg + Farbnormalisierung + Skalierung + Thumbnail → Finales Bild
"""
import io
import logging
import re
from pathlib import Path
from PIL import Image, ImageEnhance, ImageFilter, ImageOps
import numpy as np
import cv2

from app.config import settings

logger = logging.getLogger(__name__)

THUMB_MAX_SIZE        = (400, 400)
EDITED_LANDSCAPE_SIZE = (1920, 1080)
EDITED_PORTRAIT_SIZE  = (1080, 1920)


def _sanitize_filename(name: str) -> str:
    return re.sub(r'[<>:"/\\|?*]', "", name).strip()


def get_image_dir(manufacturer: str, set_name: str) -> Path:
    folder_name = _sanitize_filename(f"{manufacturer} - {set_name}")
    path = Path(settings.upload_dir) / folder_name
    path.mkdir(parents=True, exist_ok=True)
    return path


def _make_filename(variant: str, side: str, manufacturer: str, set_name: str,
                   ext: str = "jpg") -> str:
    m = _sanitize_filename(manufacturer)
    n = _sanitize_filename(set_name)
    return f"{variant} - {side} - {m} - {n}.{ext}"


def _remove_background_and_crop(image: Image.Image, padding: int = 15) -> Image.Image:
    """
    1. rembg entfernt Hintergrund → RGBA
    2. Alpha-Kanal DILATIEREN → verlorene Verpackungskanten zurückgewinnen
    3. Crop auf Alpha-Bounding-Box mit Rand (Verpackung = Bildkante)
    4. Auf Weiß zusammensetzen
    """
    try:
        import cv2
        from rembg import remove

        # Hintergrund entfernen – alpha_matting für weiche Kanten
        img_bytes = io.BytesIO()
        image.save(img_bytes, format="PNG")
        img_bytes.seek(0)
        raw = img_bytes.read()
        try:
            result_bytes = remove(
                raw,
                alpha_matting=True,
                alpha_matting_foreground_threshold=250,
                alpha_matting_background_threshold=5,
                alpha_matting_erode_size=10,
            )
        except Exception:
            logger.warning("rembg alpha_matting fehlgeschlagen, Fallback auf Standard-Modus")
            result_bytes = remove(raw)
        result = Image.open(io.BytesIO(result_bytes)).convert("RGBA")

        # Alpha-Kanal stark dilatieren: erhält Pixel, die rembg fälschlicherweise
        # als Hintergrund klassifiziert hat (z.B. helle Verpackungskanten)
        alpha = np.array(result.split()[3], dtype=np.uint8)
        kernel = np.ones((60, 60), np.uint8)
        alpha_dilated = cv2.dilate(alpha, kernel, iterations=2)

        # Dilatiertes Alpha auf RGBA-Bild zurückschreiben.
        # Neu hinzugekommene Pixel (durch Dilation) mit Originalfarben füllen,
        # damit rembg-Artefakte an den Kanten vermieden werden.
        orig_arr = np.array(image.convert("RGBA"))
        res_arr  = np.array(result)
        new_mask = (alpha_dilated > 15) & (alpha == 0)
        res_arr[new_mask, 0] = orig_arr[new_mask, 0]
        res_arr[new_mask, 1] = orig_arr[new_mask, 1]
        res_arr[new_mask, 2] = orig_arr[new_mask, 2]
        res_arr[:, :, 3] = alpha_dilated
        result = Image.fromarray(res_arr, "RGBA")

        # Bounding-Box aus dilatiertem Alpha
        rows = np.any(alpha_dilated > 15, axis=1)
        cols = np.any(alpha_dilated > 15, axis=0)

        if rows.any() and cols.any():
            rmin, rmax = int(np.where(rows)[0][0]),  int(np.where(rows)[0][-1])
            cmin, cmax = int(np.where(cols)[0][0]),  int(np.where(cols)[0][-1])
            h, w = alpha_dilated.shape

            rmin = max(0, rmin - padding)
            rmax = min(h - 1, rmax + padding)
            cmin = max(0, cmin - padding)
            cmax = min(w - 1, cmax + padding)

            result = result.crop((cmin, rmin, cmax + 1, rmax + 1))

        # Auf weißen Hintergrund legen
        white = Image.new("RGBA", result.size, (255, 255, 255, 255))
        white.paste(result, mask=result.split()[3])
        return white.convert("RGB")

    except Exception:
        logger.error("Hintergrundentfernung fehlgeschlagen, Bild wird unverändert zurückgegeben", exc_info=True)
        return image.convert("RGB")


def _normalize_colors(image: Image.Image, brightness: float = 1.05,
                      saturation: float = 1.05) -> Image.Image:
    img = image.convert("RGB")
    img = img.filter(ImageFilter.UnsharpMask(radius=1, percent=110, threshold=2))
    img = ImageEnhance.Brightness(img).enhance(brightness)
    img = ImageEnhance.Contrast(img).enhance(1.1)
    img = ImageEnhance.Color(img).enhance(saturation)
    return img


def _scale_to_target(image: Image.Image) -> Image.Image:
    """Skaliert mit weißem Padding auf Zielauflösung."""
    w, h = image.size
    target = EDITED_PORTRAIT_SIZE if h > w else EDITED_LANDSCAPE_SIZE
    image.thumbnail(target, Image.LANCZOS)
    canvas = Image.new("RGB", target, (255, 255, 255))
    offset = ((target[0] - image.width) // 2, (target[1] - image.height) // 2)
    canvas.paste(image, offset)
    return canvas


def save_original(
    file_bytes: bytes,
    side: str,
    manufacturer: str,
    set_name: str,
) -> dict:
    """Speichert Rohbild und gibt Pfad + Dimensionen zurück.

    Wendet EXIF-Rotation an, damit die gespeicherte Datei und die
    gemeldeten Dimensionen mit der Browser-Anzeige übereinstimmen.
    """
    image_dir = get_image_dir(manufacturer, set_name)
    original_filename = _make_filename("Original", side, manufacturer, set_name)
    original_path = image_dir / original_filename

    # EXIF-Rotation anwenden (Browser dreht automatisch, PIL/OpenCV nicht)
    image = Image.open(io.BytesIO(file_bytes))
    image = ImageOps.exif_transpose(image)
    w, h = image.size

    # Transponiertes Bild speichern (nicht die Roh-Bytes!)
    image.save(str(original_path), quality=95)

    return {
        "original_path": str(original_path).replace("\\", "/"),
        "width": w,
        "height": h,
    }


def detect_corners(image_path: str) -> list | None:
    """
    Auto-Erkennung der 4 Verpackungsecken via OpenCV.
    Probiert mehrere Strategien (verschiedene Canny-Schwellwerte, Farbkanäle).
    Gibt 4 Eckpunkte [[x,y], ...] zurück (TL, TR, BR, BL) oder None.
    """
    img = cv2.imread(image_path)
    if img is None:
        return None

    h, w = img.shape[:2]
    img_area = w * h

    # Mehrere Edge-Detection-Strategien probieren
    candidates = []
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

    for blur_size in [(5, 5), (7, 7)]:
        blurred = cv2.GaussianBlur(gray, blur_size, 0)
        for low, high in [(30, 100), (50, 150), (75, 200)]:
            edges = cv2.Canny(blurred, low, high)
            kernel = np.ones((3, 3), np.uint8)
            edges = cv2.dilate(edges, kernel, iterations=2)
            quad = _find_best_quad(edges, w, h, img_area)
            if quad is not None:
                candidates.append(quad)

    if not candidates:
        return None

    # Besten Kandidaten wählen: der mit der größten Fläche, die aber nicht
    # fast das gesamte Bild einnimmt (>95% = wahrscheinlich Bildrand)
    best = None
    best_area = 0
    for pts in candidates:
        area = cv2.contourArea(np.array(pts, dtype=np.float32))
        if area > img_area * 0.95:
            continue  # Zu groß → wahrscheinlich Bildrand erkannt
        if area > best_area:
            best_area = area
            best = pts

    if best is None:
        return None

    ordered = _order_points(best)

    # Nachvalidierung: keine Duplikate, Fläche > 0
    arr = np.array(ordered, dtype=np.float32)
    if cv2.contourArea(arr) < img_area * 0.05:
        return None
    for i in range(4):
        for j in range(i + 1, 4):
            if np.linalg.norm(arr[i] - arr[j]) < 20:
                return None

    return ordered


def _find_best_quad(edges, w: int, h: int, img_area: float) -> list | None:
    """Sucht in einem Edge-Bild das beste 4-Eck-Polygon."""
    contours, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return None

    contours = sorted(contours, key=cv2.contourArea, reverse=True)

    for contour in contours[:5]:
        peri = cv2.arcLength(contour, True)
        # Mehrere Epsilon-Werte probieren
        for eps in [0.015, 0.02, 0.03, 0.04]:
            approx = cv2.approxPolyDP(contour, eps * peri, True)
            if len(approx) == 4:
                area = cv2.contourArea(approx)
                # Mindestfläche: 15% des Bildes (statt 10%)
                if area > img_area * 0.15:
                    pts = approx.reshape(4, 2).tolist()
                    if _validate_quad(pts, w, h):
                        return pts

    return None


def _validate_quad(pts: list, img_w: int, img_h: int) -> bool:
    """Prüft ob ein erkanntes Viereck plausibel ist."""
    arr = np.array(pts, dtype=np.float32)

    # Alle Punkte müssen innerhalb des Bildes liegen (mit kleinem Rand)
    margin = 5
    for p in arr:
        if p[0] < -margin or p[0] > img_w + margin:
            return False
        if p[1] < -margin or p[1] > img_h + margin:
            return False

    # Konvexität prüfen
    if not cv2.isContourConvex(arr.reshape(-1, 1, 2).astype(np.int32)):
        return False

    # Keine zwei Ecken dürfen zu nah beieinander sein (min 5% der kleineren Dimension)
    min_dist = min(img_w, img_h) * 0.05
    for i in range(4):
        for j in range(i + 1, 4):
            if np.linalg.norm(arr[i] - arr[j]) < min_dist:
                return False

    return True


def _order_points(pts: list) -> list:
    """Sortiert 4 Punkte in TL, TR, BR, BL Reihenfolge.

    Verwendet winkelbasierte Sortierung vom Schwerpunkt aus.
    Robuster als Sum/Diff-Heuristik, funktioniert auch bei stark
    gedrehten Boxen (die alte Methode erzeugte dort Duplikate).
    """
    pts = np.array(pts, dtype=np.float32)
    center = pts.mean(axis=0)

    # Winkel jedes Punkts vom Schwerpunkt: atan2(dy, dx)
    # Oben-links ≈ -145°, oben-rechts ≈ -35°,
    # unten-rechts ≈ +35°, unten-links ≈ +145°
    angles = np.arctan2(pts[:, 1] - center[1], pts[:, 0] - center[0])
    order = np.argsort(angles)
    sorted_pts = pts[order]

    # Aufsteigend sortierte Winkel ergeben: TL, TR, BR, BL
    return [p.tolist() for p in sorted_pts]


def apply_perspective_transform(image_path: str, corners: list) -> str:
    """
    Perspektivkorrektur via cv2.getPerspectiveTransform + warpPerspective.
    corners = [[x1,y1], [x2,y2], [x3,y3], [x4,y4]] in Reihenfolge TL, TR, BR, BL.
    Speichert als Preview-Datei und gibt Pfad zurück.
    """
    img = cv2.imread(image_path)
    if img is None:
        raise ValueError(f"Bild nicht lesbar: {image_path}")

    pts = np.array(corners, dtype=np.float32)

    # Zielgröße aus den Ecken berechnen
    width_top = np.linalg.norm(pts[1] - pts[0])
    width_bottom = np.linalg.norm(pts[2] - pts[3])
    height_left = np.linalg.norm(pts[3] - pts[0])
    height_right = np.linalg.norm(pts[2] - pts[1])

    max_width = int(max(width_top, width_bottom))
    max_height = int(max(height_left, height_right))

    dst = np.array([
        [0, 0],
        [max_width - 1, 0],
        [max_width - 1, max_height - 1],
        [0, max_height - 1],
    ], dtype=np.float32)

    matrix = cv2.getPerspectiveTransform(pts, dst)
    warped = cv2.warpPerspective(img, matrix, (max_width, max_height),
                                  flags=cv2.INTER_LANCZOS4,
                                  borderMode=cv2.BORDER_REPLICATE)

    # Preview speichern im selben Verzeichnis
    src = Path(image_path)
    preview_path = src.parent / src.name.replace("Original", "Preview")
    cv2.imwrite(str(preview_path), warped)

    return str(preview_path).replace("\\", "/")


def apply_rotation(image_path: str, angle_degrees: float) -> str:
    """
    Rotiert Bild um angle_degrees.
    Konvention: positiv = im Uhrzeigersinn (wie CSS rotate()).
    PIL nutzt die umgekehrte Konvention, daher wird der Winkel negiert.
    """
    image = Image.open(image_path)
    rotated = image.rotate(-angle_degrees, expand=True, fillcolor=(255, 255, 255),
                           resample=Image.BICUBIC)

    src = Path(image_path)
    # Falls Dateiname "Original" enthält, Preview daraus machen
    name = src.name.replace("Original", "Preview")
    if name == src.name:
        # Bereits ein Preview – überschreiben
        name = src.name
    preview_path = src.parent / name
    rotated.save(str(preview_path), "JPEG", quality=95)

    return str(preview_path).replace("\\", "/")


def finalize_image(
    image_path: str,
    side: str,
    manufacturer: str,
    set_name: str,
    brightness: float = 1.05,
    saturation: float = 1.05,
) -> dict[str, str]:
    """
    Finalisierung: Skalierung → Farbnormalisierung → Thumbnail.
    Arbeitet auf der Preview-Datei (nach Perspektivkorrektur/Rotation).
    Skaliert proportional ohne weißen Rand (aspect-ratio bleibt erhalten).
    """
    image = Image.open(image_path).convert("RGB")
    image_dir = get_image_dir(manufacturer, set_name)
    edited_filename = _make_filename("Bearbeitet", side, manufacturer, set_name)
    thumb_filename = _make_filename("Thumbmail", side, manufacturer, set_name)

    # Proportional skalieren (kein weißes Padding)
    w, h = image.size
    target = EDITED_PORTRAIT_SIZE if h > w else EDITED_LANDSCAPE_SIZE
    image.thumbnail(target, Image.LANCZOS)
    edited = image
    # Dann Farbnormalisierung auf dem kleinen Bild (schnell)
    edited = _normalize_colors(edited, brightness=brightness, saturation=saturation)

    edited_path = image_dir / edited_filename
    edited.save(str(edited_path), "JPEG", quality=90)

    thumb = edited.copy()
    thumb.thumbnail(THUMB_MAX_SIZE, Image.LANCZOS)
    thumb_path = image_dir / thumb_filename
    thumb.save(str(thumb_path), "JPEG", quality=85)

    def rel(p: Path) -> str:
        return str(p).replace("\\", "/")

    return {
        "edited": rel(edited_path),
        "thumbnail": rel(thumb_path),
    }


def process_image(
    file_bytes: bytes,
    side: str,
    manufacturer: str,
    set_name: str,
) -> dict[str, str]:
    """Verarbeitungs-Pipeline. Gibt dict mit relativen Pfaden zurück."""
    image_dir         = get_image_dir(manufacturer, set_name)
    original_filename = _make_filename("Original",   side, manufacturer, set_name)
    edited_filename   = _make_filename("Bearbeitet", side, manufacturer, set_name)
    thumb_filename    = _make_filename("Thumbmail",  side, manufacturer, set_name)

    # 1. Original speichern
    original_path = image_dir / original_filename
    with open(original_path, "wb") as f:
        f.write(file_bytes)

    # 2. Verarbeiten
    image = Image.open(io.BytesIO(file_bytes))

    # 3. Hintergrund entfernen + zuschneiden (Alpha-Dilatation für bessere Kanten)
    image = _remove_background_and_crop(image)

    # 4. Farbnormalisierung
    image = _normalize_colors(image)

    # 5. Auf Zielauflösung skalieren
    edited = _scale_to_target(image.copy())
    edited_path = image_dir / edited_filename
    edited.save(str(edited_path), "JPEG", quality=90)

    # 6. Thumbnail
    thumb = edited.copy()
    thumb.thumbnail(THUMB_MAX_SIZE, Image.LANCZOS)
    thumb_path = image_dir / thumb_filename
    thumb.save(str(thumb_path), "JPEG", quality=85)

    def rel(p: Path) -> str:
        return str(p).replace("\\", "/")

    return {
        "original":  rel(original_path),
        "edited":    rel(edited_path),
        "thumbnail": rel(thumb_path),
    }
