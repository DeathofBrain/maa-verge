# Native worker dependencies

Maa Verge's native worker is AGPL-3.0-only under the repository license. Its C ABI
declarations match MaaCore's documented public interface; MaaCore is downloaded
and loaded independently and is not linked into this executable.

## MaaCore v6.20.0 pure-color RGBCount adaptation

The explicit `RGBCount` / `pureColor:true` path in `src/framework.cpp` adapts
MaaAssistantArknights' RGB mask unions, 3×3 morphological close, F1 score and
scan-order multi-match suppression. Image decoding uses MaaFramework's public
C API. Integer integral images and template row runs replace OpenCV's count
correlation; the general Ccoeff-multiplied and HSVCount paths are not included.
The upstream source and downloaded game resources remain unmodified.

Sources (tag `v6.20.0`):

- https://github.com/MaaAssistantArknights/MaaAssistantArknights/blob/v6.20.0/src/MaaCore/Vision/Matcher.cpp
- https://github.com/MaaAssistantArknights/MaaAssistantArknights/blob/v6.20.0/src/MaaCore/Vision/MultiMatcher.cpp
- https://github.com/MaaAssistantArknights/MaaAssistantArknights/blob/v6.20.0/src/MaaCore/Vision/Config/MatcherConfig.h

Copyright: MaaAssistantArknights contributors. License: GNU Affero General
Public License version 3, provided by this repository's `LICENSE` and upstream
https://github.com/MaaAssistantArknights/MaaAssistantArknights/blob/v6.20.0/LICENSE.
This adaptation is distributed under Maa Verge's AGPL-3.0-only license.

## nlohmann/json 3.12.0

Source: https://github.com/nlohmann/json/releases/tag/v3.12.0

The unmodified single header and upstream license are vendored in
`3rdparty/nlohmann-json`. CMake verifies the header with SHA-256
`aaf127c04cb31c406e5b04a63f1ae89369fccde6d8fa7cdda1ed4f32dfc5de63`.
Source files: https://github.com/nlohmann/json/tree/v3.12.0/single_include/nlohmann
and https://github.com/nlohmann/json/blob/v3.12.0/LICENSE.MIT.

MIT License

Copyright (c) 2013-2025 Niels Lohmann

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## MaaFramework v5.14.3 public C headers

Source: https://github.com/MaaXYZ/MaaFramework/tree/v5.14.3/include/MaaFramework

Revision: `8963191215ca49d6b037802acd07d20a4213160a`.

The unmodified public C headers and upstream GNU Lesser General Public License
version 3 are vendored in `3rdparty/maaframework`. `upstream.json` records their
SHA-256 values, checked by CMake. The full license is installed alongside this
notice as `maaframework-LICENSE.md`, together with GNU GPL version 3 as
`maaframework-COPYING.GPL3`; packaged runtime notices retain both licenses under
`maaframework/`. `runtime-assets.json` pins the additional GNU GPL text, its
official source and SHA-256; SDK preparation includes the same license and
provenance under `licenses/maaverge/`. MaaFramework is dynamically loaded only in
an explicitly selected framework worker process; MaaCore processes do not load it. Official SDK runtime
binaries, their dependencies and their notices are distributed separately from
the vendored header source. See https://github.com/MaaXYZ/MaaFramework.
