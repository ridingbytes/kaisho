import os
import subprocess
from pathlib import Path


def open_in_editor(path: Path) -> None:
    """Open a file in $EDITOR, $VISUAL, or vim as fallback."""
    editor = os.environ.get("VISUAL") or os.environ.get("EDITOR")
    if editor:
        subprocess.run([editor, str(path)])
    else:
        subprocess.run(["emacs", "-nw", str(path)])
