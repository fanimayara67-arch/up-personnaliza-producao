"""Window-only capture. No desktop fallback; consent lives only in this process."""

import ctypes
import io
import os
from contextlib import contextmanager


@contextmanager
def physical_pixels():
    from ctypes import wintypes

    user = ctypes.WinDLL("user32", use_last_error=True)
    change = user.SetThreadDpiAwarenessContext
    change.argtypes = [wintypes.HANDLE]
    change.restype = wintypes.HANDLE
    previous = change(-4)  # DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2
    if not previous:
        raise ctypes.WinError(ctypes.get_last_error())
    try:
        yield
    finally:
        change(previous)


def process_path(pid):
    import win32api, win32con
    from ctypes import wintypes

    handle = win32api.OpenProcess(
        win32con.PROCESS_QUERY_LIMITED_INFORMATION, False, pid
    )
    try:
        # pywin32 does not expose QueryFullProcessImageName in win32process.
        # Use the documented Windows API with a limited-query process handle.
        kernel = ctypes.WinDLL("kernel32", use_last_error=True)
        query = kernel.QueryFullProcessImageNameW
        query.argtypes = [
            wintypes.HANDLE,
            wintypes.DWORD,
            wintypes.LPWSTR,
            ctypes.POINTER(wintypes.DWORD),
        ]
        query.restype = wintypes.BOOL
        path = ctypes.create_unicode_buffer(32768)
        length = wintypes.DWORD(len(path))
        if not query(int(handle), 0, path, ctypes.byref(length)):
            raise ctypes.WinError(ctypes.get_last_error())
        return path.value
    finally:
        handle.Close()


def corel_windows():
    import win32gui, win32process

    result = []

    def check(hwnd, _):
        if not win32gui.IsWindowVisible(hwnd):
            return
        _, pid = win32process.GetWindowThreadProcessId(hwnd)
        try:
            if os.path.basename(process_path(pid)).lower() == "coreldrw.exe":
                result.append((hwnd, pid, win32gui.GetWindowText(hwnd)))
        except Exception:
            pass

    win32gui.EnumWindows(check, None)
    return result


class WindowCapture:
    def __init__(self, hwnd, pid):
        self.hwnd = hwnd
        self.pid = pid

    @classmethod
    def authorize(cls, expected_hwnd):
        windows = [w for w in corel_windows() if w[0] == expected_hwnd]
        if not windows:
            raise ValueError(
                "Janela da instância de produção não disponível para seleção."
            )
        print("Captura restrita à janela de produção:")
        print("1. " + windows[0][2])
        if (
            input("Digite AUTORIZAR 1 para transmitir apenas esta janela: ").strip()
            != "AUTORIZAR 1"
        ):
            return None
        return cls(windows[0][0], windows[0][1])

    def jpeg(self):
        with physical_pixels():
            return self._jpeg()

    def _jpeg(self):
        import win32gui, win32ui, win32process
        from PIL import Image

        if not win32gui.IsWindow(self.hwnd) or win32gui.IsIconic(self.hwnd):
            return None
        _, pid = win32process.GetWindowThreadProcessId(self.hwnd)
        if (
            pid != self.pid
            or os.path.basename(process_path(pid)).lower() != "coreldrw.exe"
        ):
            raise ValueError("A janela autorizada mudou. Captura interrompida.")
        left, top, right, bottom = win32gui.GetWindowRect(self.hwnd)
        width, height = right - left, bottom - top
        if not 1 <= width <= 10000 or not 1 <= height <= 10000:
            return None
        source = win32gui.GetWindowDC(self.hwnd)
        dc = win32ui.CreateDCFromHandle(source)
        target = dc.CreateCompatibleDC()
        bitmap = win32ui.CreateBitmap()
        bitmap.CreateCompatibleBitmap(dc, width, height)
        target.SelectObject(bitmap)
        try:
            # PrintWindow renders only this HWND, even when other windows overlap it.
            from ctypes import wintypes

            print_window = ctypes.windll.user32.PrintWindow
            print_window.argtypes = [wintypes.HWND, wintypes.HDC, wintypes.UINT]
            print_window.restype = wintypes.BOOL
            if not print_window(self.hwnd, target.GetSafeHdc(), 2):
                return None
            image = Image.frombuffer(
                "RGB", (width, height), bitmap.GetBitmapBits(True), "raw", "BGRX", 0, 1
            )
            if not image.getbbox():
                return None
            image.thumbnail((1600, 1000))
            out = io.BytesIO()
            image.save(out, "JPEG", quality=75)
            return out.getvalue()
        finally:
            win32gui.DeleteObject(bitmap.GetHandle())
            target.DeleteDC()
            dc.DeleteDC()
            win32gui.ReleaseDC(self.hwnd, source)
