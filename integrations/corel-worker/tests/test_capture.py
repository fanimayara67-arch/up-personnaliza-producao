import os
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from capture import process_path, physical_pixels


@unittest.skipUnless(os.name == "nt", "Requires real Windows process handles")
class WindowIdentityTests(unittest.TestCase):
    def test_capture_uses_physical_pixels_and_restores_thread_context(self):
        import ctypes
        from ctypes import wintypes

        user = ctypes.WinDLL("user32")
        current = user.GetThreadDpiAwarenessContext
        current.restype = wintypes.HANDLE
        equal = user.AreDpiAwarenessContextsEqual
        equal.argtypes = [wintypes.HANDLE, wintypes.HANDLE]
        equal.restype = wintypes.BOOL
        previous = current()
        with physical_pixels():
            self.assertTrue(equal(current(), -4))
        self.assertTrue(equal(current(), previous))

    def test_current_process_path_is_resolved_with_limited_permissions(self):
        resolved = Path(process_path(os.getpid()))
        self.assertTrue(resolved.is_file())
        # Microsoft Store's venv launcher is python.exe; the real image can be
        # python3.12.exe. Both must identify a real, absolute Python executable.
        self.assertTrue(resolved.is_absolute())
        self.assertTrue(resolved.name.lower().startswith("python"))

    def test_inaccessible_system_process_is_rejected(self):
        import pywintypes

        with self.assertRaises((OSError, pywintypes.error)):
            process_path(0)


if __name__ == "__main__":
    unittest.main()
