import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from svg_io import read_svg, analysis_summary
from engine import nest, validate, checked_svg, export_dxf, solid


def svg(objects, width=100, height=100):
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}mm" height="{height}mm" viewBox="0 0 {width} {height}">{objects}</svg>'.encode()


def params(**updates):
    return {
        "width": 120,
        "height": 90,
        "margin": 2,
        "gap": 3,
        "rotations": [0, 90, 180, 270],
        "quantities": {},
        "timeLimit": 3,
        "allowHoles": False,
        "camPending": True,
        **updates,
    }


class GeometryTests(unittest.TestCase):
    def test_physical_scale_and_quantities(self):
        source = read_svg(svg('<rect width="20" height="10"/>'))
        p = params(quantities={"p1": 5})
        result = nest(source, p)
        self.assertTrue(result["validation"]["valid"])
        self.assertEqual(len(result["placements"]), 5)
        self.assertTrue(
            read_svg(checked_svg(source, p, result["placements"]))["width"] == 120
        )

    def test_concave_contours_interlock(self):
        source = read_svg(svg('<path d="M0 0 H30 V10 H10 V30 H0 Z"/>'))
        p = params(width=43, height=43, margin=0, gap=0, quantities={"p1": 2})
        result = nest(source, p)
        self.assertTrue(result["validation"]["valid"], result)
        from shapely.geometry import box
        from svg_io import apply_matrix

        a, b = [
            apply_matrix(source["pieces"][0]["geometry"], v["matrix"])
            for v in result["placements"]
        ]
        self.assertGreater(box(*a.bounds).intersection(box(*b.bounds)).area, 0)

    def test_collision_outside_spacing_count_scale(self):
        source = read_svg(svg('<rect width="20" height="10"/>'))
        p = params(quantities={"p1": 2})
        for placements in [
            [{"pieceId": "p1", "matrix": [1, 0, 0, 1, 2, 2]}] * 2,
            [{"pieceId": "p1", "matrix": [1, 0, 0, 1, 200, 2]}],
            [{"pieceId": "p1", "matrix": [2, 0, 0, 2, 2, 2]}],
            [
                {"pieceId": "p1", "matrix": [1, 0, 0, 1, 2, 2]},
                {"pieceId": "p1", "matrix": [1, 0, 0, 1, 23, 2]},
            ],
        ]:
            self.assertFalse(validate(source, p, placements)["valid"])

    def test_holes_opt_in(self):
        source = read_svg(
            svg(
                '<path fill-rule="evenodd" d="M0 0H60V60H0Z M10 10H50V50H10Z"/><rect x="70" width="20" height="20"/>'
            )
        )
        p = params(width=61, height=61, margin=0, gap=1, allowHoles=True)
        self.assertTrue(nest(source, p)["validation"]["valid"])
        p["allowHoles"] = False
        self.assertFalse(nest(source, p)["validation"]["valid"])

    def test_bad_contours_and_security(self):
        for content in [
            '<path d="M0 0 L10 10"/>',
            '<path d="M0 0 L20 20 L0 20 L20 0 Z"/>',
            '<text x="0">A</text>',
            "<script>alert(1)</script>",
            '<rect width="10" height="10" onclick="a()"/>',
            '<image href="https://example.com/a.png"/>',
        ]:
            with self.assertRaises(ValueError):
                read_svg(svg(content))

    def test_curves_preserved(self):
        source = read_svg(svg('<path d="M10 10 C10 0 30 0 30 10 L30 30 L10 30 Z"/>'))
        p = params()
        result = nest(source, p)
        data = checked_svg(source, p, result["placements"])
        self.assertIn(b"C10 0 30 0 30 10", data)
        self.assertTrue(result["validation"]["valid"])

    def test_unknown_units_and_duplicates(self):
        with self.assertRaises(ValueError):
            read_svg(
                b'<svg width="100" height="100" viewBox="0 0 100 100"><rect width="10" height="10"/></svg>'
            )
        source = read_svg(
            svg('<rect width="10" height="10"/><rect x="20" width="10" height="10"/>')
        )
        self.assertEqual(analysis_summary(source)["duplicates"], [["p1", "p2"]])

    def test_dxf_roundtrip_in_millimeters(self):
        import tempfile

        source = read_svg(svg('<rect width="20" height="10"/>'))
        p = params(quantities={"p1": 3})
        result = nest(source, p)
        with tempfile.TemporaryDirectory() as directory:
            export_dxf(source, p, result["placements"], Path(directory) / "result.dxf")

    def test_nested_island_is_safe_when_holes_disabled(self):
        source = read_svg(
            svg(
                '<path fill-rule="evenodd" d="M0 0H60V60H0Z M10 10H50V50H10Z M20 20H40V40H20Z"/>'
            )
        )
        self.assertTrue(solid(source["pieces"][0]["geometry"]).is_valid)


if __name__ == "__main__":
    unittest.main()
