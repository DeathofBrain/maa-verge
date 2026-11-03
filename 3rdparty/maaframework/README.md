# MaaFramework C headers

This directory vendors the unmodified public C API headers and license from
[MaaXYZ/MaaFramework v5.14.3](https://github.com/MaaXYZ/MaaFramework/tree/v5.14.3),
commit `8963191215ca49d6b037802acd07d20a4213160a`.

`upstream.json` records every vendored header and license SHA-256. CMake checks
these hashes before compiling. Do not format or edit the upstream files; update
the pinned upstream source and provenance together when upgrading.

The native worker uses `decltype` of these declarations for dynamically resolved
function pointers. It does not link or download MaaFramework during compilation.
`runtime-assets.json` separately pins the official SDK archives for the supported
platforms. The application installs runtime libraries and their dependencies as an
independent component through its update service; the SDK remains separate from
MaaCore and game resources and is not embedded in application packages.
`tools/prepare-maafw.mjs` is an explicit maintainer tool for offline SDK validation;
development startup does not run it or load that cache automatically.

MaaFramework is licensed under the GNU Lesser General Public License, version 3;
see the upstream [LICENSE.md](LICENSE.md). These headers are included in the
AGPL-3.0-only Maa Verge worker under compatible terms. SDK distribution must also
preserve the SDK's third-party notices and licenses.
