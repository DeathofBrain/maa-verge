# MAA Python helpers

`asst/updater.py`, `downloader.py`, `asst.py`, and `utils.py` are vendored
from MaaAssistantArknights/MaaAssistantArknights, tag **v6.20.0**,
`src/Python/asst/`, under AGPL-3.0-only. Copyright belongs to the upstream
MAA contributors. The full license is retained in `LICENSE.MAA`.

Source: https://github.com/MaaAssistantArknights/MaaAssistantArknights/tree/v6.20.0/src/Python/asst

Maa Verge invokes the official `Updater.update()` in an isolated process.
Its download is redirected to the previously downloaded, size/hash checked
archive, metadata is pinned to the checked release, and archive extraction
is replaced by the traversal/link-safe Maa Verge extractor. The constructor
is bypassed for existing installations because the current version has already
been read from the validated generation manifest. Fresh installations extract
the verified official archive directly because the upstream constructor
requires an existing MaaCore. The official C API
does not contain an auto-update function.
