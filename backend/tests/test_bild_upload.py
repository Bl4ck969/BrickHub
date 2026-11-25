"""Tests für BH-4 (Bild-Upload). Lauf (aus backend/): python -m unittest discover -s tests

Braucht Pillow, numpy und opencv (image_service importiert sie), nicht rembg/DB.
"""
import io
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from PIL import Image

from app.services import image_service as svc


def _bild(fmt: str, size=(20, 10)) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", size, (200, 10, 10)).save(buf, fmt)
    return buf.getvalue()


class Pruefung(unittest.TestCase):
    def test_echte_bilder_gehen_durch(self):
        for fmt in ("JPEG", "PNG", "WEBP"):
            svc.validate_image_bytes(_bild(fmt))

    def test_text_als_bild_wird_abgelehnt(self):
        with self.assertRaises(svc.ImageRejected):
            svc.validate_image_bytes(b"<html>kein bild</html>" * 10)

    def test_gif_wird_abgelehnt(self):
        buf = io.BytesIO()
        Image.new("P", (5, 5)).save(buf, "GIF")
        with self.assertRaises(svc.ImageRejected):
            svc.validate_image_bytes(buf.getvalue())

    def test_kaputter_kopf_wird_abgelehnt(self):
        with self.assertRaises(svc.ImageRejected):
            svc.validate_image_bytes(b"\x89PNG\r\n\x1a\n" + b"\x00" * 20)

    def test_zu_viele_pixel(self):
        with mock.patch.object(svc, "MAX_IMAGE_PIXELS", 100):
            with self.assertRaises(svc.ImageRejected) as e:
                svc.validate_image_bytes(_bild("PNG", (20, 10)))
        self.assertIn("Pixel", str(e.exception))

    def test_pillow_warnung_wird_fehler(self):
        # Pillows eigene Warnschwelle weit unter unserer Grenze
        with mock.patch.object(Image, "MAX_IMAGE_PIXELS", 100):
            with self.assertRaises(svc.ImageRejected):
                svc.validate_image_bytes(_bild("PNG", (20, 10)))


class Dateinamen(unittest.TestCase):
    def test_alt_ohne_id_unveraendert(self):
        self.assertEqual(svc._make_filename("Thumbmail", "Frontcover", "Lego", "Burg"),
                         "Thumbmail - Frontcover - Lego - Burg.jpg")

    def test_mit_id_trennt_gleichnamige_sets(self):
        a = svc._make_filename("Original", "Frontcover", "Lego", "Burg", set_id=1)
        b = svc._make_filename("Original", "Frontcover", "Lego", "Burg", set_id=2)
        self.assertNotEqual(a, b)
        self.assertIn("Original", a)


class Loeschen(unittest.TestCase):
    def test_loescht_nur_eigene_dateien_im_upload_ordner(self):
        with tempfile.TemporaryDirectory() as root, tempfile.TemporaryDirectory() as fremd:
            ordner = Path(root) / "Lego - Burg"
            ordner.mkdir()
            eigen = ordner / "Original - Frontcover - Lego - Burg - 1.jpg"
            preview = ordner / "Preview - Frontcover - Lego - Burg - 1.jpg"
            geteilt = ordner / "Thumbmail - Frontcover - Lego - Burg.jpg"
            for f in (eigen, preview, geteilt):
                f.write_bytes(b"x")
            draussen = Path(fremd) / "a.jpg"
            draussen.write_bytes(b"x")
            with mock.patch.object(svc.settings, "upload_dir", root):
                svc.delete_set_images(
                    [str(eigen), str(geteilt), str(draussen), None],
                    {str(geteilt).replace("\\", "/")},
                )
            self.assertFalse(eigen.exists())
            self.assertFalse(preview.exists())
            self.assertTrue(geteilt.exists())    # anderes Set zeigt noch darauf
            self.assertTrue(draussen.exists())   # außerhalb des Upload-Ordners
            self.assertTrue(ordner.exists())     # nicht leer

    def test_setname_mit_original_findet_preview(self):
        with tempfile.TemporaryDirectory() as root:
            ordner = Path(root) / "Lego - Original Burg"
            ordner.mkdir()
            orig = ordner / "Original - Frontcover - Lego - Original Burg - 1.jpg"
            # so benennt apply_perspective_transform: alle „Original“ im Namen werden ersetzt
            prev = ordner / "Preview - Frontcover - Lego - Preview Burg - 1.jpg"
            orig.write_bytes(b"x")
            prev.write_bytes(b"x")
            with mock.patch.object(svc.settings, "upload_dir", root):
                svc.delete_set_images([str(orig)], set())
            self.assertFalse(prev.exists())
            self.assertFalse(ordner.exists())

    def test_leerer_ordner_wird_entfernt(self):
        with tempfile.TemporaryDirectory() as root:
            ordner = Path(root) / "Lego - Burg"
            ordner.mkdir()
            f = ordner / "Original - Frontcover - Lego - Burg - 1.jpg"
            f.write_bytes(b"x")
            with mock.patch.object(svc.settings, "upload_dir", root):
                svc.delete_set_images([str(f)], set())
            self.assertFalse(ordner.exists())
            self.assertTrue(Path(root).exists())

    def test_fehlende_datei_wirft_nicht(self):
        with tempfile.TemporaryDirectory() as root:
            with mock.patch.object(svc.settings, "upload_dir", root):
                svc.delete_set_images([str(Path(root) / "gibtsnicht.jpg")], set())


if __name__ == "__main__":
    unittest.main()
