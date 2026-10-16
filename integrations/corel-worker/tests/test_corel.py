import sys
import unittest
from pathlib import Path
from shapely.affinity import scale, translate
from shapely.geometry import Polygon
from defusedxml.common import EntitiesForbidden

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from corel import normalize_corel_svg, verify_corel_roundtrip
from svg_io import read_svg


class CorelExportContractTests(unittest.TestCase):
    def source(self):
        return read_svg(
            b'<svg xmlns="http://www.w3.org/2000/svg" width="50mm" height="50mm" viewBox="0 0 50 50"><path fill-rule="evenodd" d="M5 5H35V35H5Z M10 10H30V30H10Z"/></svg>'
        )

    def test_reopened_export_rejects_changed_count_scale_position_or_holes(self):
        expected = self.source()
        verify_corel_roundtrip(expected, self.source())
        geometry = expected["pieces"][0]["geometry"]
        for changed in (
            scale(geometry, 1.1, 1.1),
            translate(geometry, 1, 0),
            Polygon(geometry.exterior),
        ):
            actual = self.source()
            actual["pieces"][0]["geometry"] = changed
            with self.assertRaises(ValueError):
                verify_corel_roundtrip(expected, actual)
        actual = self.source()
        actual["pieces"] *= 2
        with self.assertRaises(ValueError):
            verify_corel_roundtrip(expected, actual)

    def test_normalization_preserves_geometry_and_does_not_allow_clipping(self):
        original = b'<svg xmlns="http://www.w3.org/2000/svg" width="10mm" height="10mm" viewBox="0 0 10 10" clip-rule="evenodd"><path d="M1 1H9V9H1Z"/></svg>'
        parsed = read_svg(normalize_corel_svg(original))
        self.assertEqual(parsed["pieces"][0]["geometry"].area, 64)
        clipped = original.replace(b'clip-rule="evenodd"', b'clip-path="url(#hidden)"')
        with self.assertRaises(ValueError):
            read_svg(normalize_corel_svg(clipped))

    def test_export_normalization_rejects_xml_entities(self):
        with self.assertRaises(EntitiesForbidden):
            normalize_corel_svg(
                b'<!DOCTYPE svg [<!ENTITY bad SYSTEM "file:///secret">]><svg>&bad;</svg>'
            )


if __name__ == "__main__":
    unittest.main()
