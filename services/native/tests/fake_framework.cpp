// CTest-only MaaFramework C ABI fixture. It never spawns a process or accesses a device.
#include <MaaFramework/MaaAPI.h>
#include <nlohmann/json.hpp>

#include <algorithm>
#include <atomic>
#include <chrono>
#include <cstdio>
#include <cstdlib>
#include <fstream>
#include <iterator>
#include <mutex>
#include <string>
#include <thread>
#include <vector>

using Json = nlohmann::json;
struct MaaResource {
  bool loaded = false;
};
struct MaaController {
  bool connected = false;
};
struct MaaTasker {
  MaaController* controller = nullptr;
  std::atomic<bool> stopped = false;
  mutable std::atomic<bool> stop_observed = true;
  std::atomic<MaaTaskId> next_id = 100;
  std::atomic<MaaTaskId> active_id = 0;
  std::atomic<MaaTaskId> stop_id = 0;
  std::atomic<std::int64_t> stop_started_ms = 0;
  std::chrono::steady_clock::time_point started;
  std::string kind;
};
struct MaaStringBuffer {
  std::string text;
};
struct MaaImageBuffer {
  int width = 0;
  int height = 0;
  std::vector<unsigned char> bytes;
  std::vector<unsigned char> pixels;
};

namespace {
std::mutex trace_mutex;
bool scenario(const char* name) {
  const auto* selected = std::getenv("MAAVERGE_FRAMEWORK_CASE");
  return selected && std::string(selected) == name;
}
std::int64_t now_ms() {
  return std::chrono::duration_cast<std::chrono::milliseconds>(
             std::chrono::steady_clock::now().time_since_epoch())
      .count();
}
void trace(const std::string& line) {
  std::lock_guard guard(trace_mutex);
  if (const auto* path = std::getenv("MAAVERGE_FRAMEWORK_TRACE")) {
    std::ofstream output(path, std::ios::app);
    output << line << '\n';
  }
}
void load_image(MaaImageBuffer* image) {
  image->width = 1280;
  image->height = 720;
  if (const auto* path = std::getenv("MAAVERGE_FRAMEWORK_IMAGE")) {
    std::ifstream input(path, std::ios::binary);
    image->bytes.assign(std::istreambuf_iterator<char>(input), std::istreambuf_iterator<char>());
  }
}
std::uint32_t be(const unsigned char* data) {
  return (std::uint32_t(data[0]) << 24) | (std::uint32_t(data[1]) << 16) |
         (std::uint32_t(data[2]) << 8) | data[3];
}
}  // namespace

extern "C" {
#ifndef OMIT_FRAMEWORK_VERSION
const char* MaaVersion() {
  std::puts("synthetic framework stdout: loaded");
  trace("version");
  return scenario("wrong-version") ? "v0.0.0" : "v5.14.3";
}
#endif
MaaBool MaaGlobalSetOption(MaaGlobalOption key, MaaOptionValue, MaaOptionValueSize) {
  trace("global-option:" + std::to_string(key));
  return true;
}
MaaResource* MaaResourceCreate() {
  trace("resource-create");
  return new MaaResource;
}
void MaaResourceDestroy(MaaResource* resource) {
  trace("resource-destroy");
  delete resource;
}
MaaResId MaaResourcePostBundle(MaaResource* resource, const char* path) {
  trace("resource:" + std::string(path));
  resource->loaded = !scenario("resource-fail");
  return 1;
}
MaaStatus MaaResourceStatus(const MaaResource* resource, MaaResId) {
  return resource->loaded ? MaaStatus_Succeeded : MaaStatus_Failed;
}
MaaBool MaaResourceLoaded(const MaaResource* resource) { return resource->loaded; }
MaaBool MaaResourceSetOption(MaaResource*, MaaResOption key, MaaOptionValue value,
                             MaaOptionValueSize) {
  trace("resource-option:" + std::to_string(key) + ":" + std::to_string(*static_cast<int*>(value)));
  return true;
}
MaaBool MaaResourceOverrideImage(MaaResource*, const char* name, const MaaImageBuffer* image) {
  trace("override-image:" + std::string(name) + ":" +
        Json(std::vector<unsigned char>(image->pixels.begin(), image->pixels.begin() + 12)).dump());
  return !scenario("override-fail");
}
MaaTasker* MaaTaskerCreate() {
  trace("tasker-create");
  return new MaaTasker;
}
void MaaTaskerDestroy(MaaTasker* tasker) {
  if (!tasker->stop_observed) std::abort();
  trace("tasker-destroy-start");
  if (scenario("destroy-delay")) std::this_thread::sleep_for(std::chrono::milliseconds(300));
  trace("tasker-destroy-done");
  std::puts("synthetic framework stdout: destroyed");
  delete tasker;
}
MaaBool MaaTaskerBindResource(MaaTasker*, MaaResource*) { return true; }
MaaBool MaaTaskerBindController(MaaTasker* tasker, MaaController* controller) {
  trace("bind-controller");
  tasker->controller = controller;
  return true;
}
MaaTaskId MaaTaskerPostRecognition(MaaTasker* tasker, const char* kind, const char* params,
                                   const MaaImageBuffer*) {
  tasker->stopped = false;
  tasker->kind = kind;
  tasker->started = std::chrono::steady_clock::now();
  trace("recognition:" + std::string(kind) + ":" + params);
  tasker->stop_id = 0;
  return tasker->active_id = tasker->next_id++;
}
MaaTaskId MaaTaskerPostAction(MaaTasker* tasker, const char* kind, const char* params,
                              const MaaRect* box, const char*) {
  if (!box || !tasker->controller) return MaaInvalidId;
  if (tasker->stopped && MaaTaskerRunning(tasker)) return MaaInvalidId;
  tasker->stopped = false;
  tasker->kind = kind;
  tasker->started = std::chrono::steady_clock::now();
  trace("action:" + std::string(kind) + ":" + params);
  if (std::string(kind) == "Swipe" || std::string(kind) == "LongPress") trace("touch-down");
  tasker->stop_id = 0;
  return tasker->active_id = tasker->next_id++;
}
MaaTaskId MaaTaskerPostStop(MaaTasker* tasker) {
  trace("stop");
  tasker->stopped = true;
  tasker->stop_observed = false;
  // Official AsyncRunner::clear() removes every old action/stop status. Every
  // newly posted stop must have a distinct id, never the old constant fixture id.
  tasker->active_id = 0;
  tasker->stop_started_ms = now_ms();
  tasker->stop_id = tasker->next_id++;
  trace("touch-up");
  return scenario("stop-invalid") ? MaaInvalidId : tasker->stop_id.load();
}
MaaStatus MaaTaskerStatus(const MaaTasker* tasker, MaaTaskId id) {
  if (id == tasker->stop_id && id != 0) {
    if (scenario("stop-race") && now_ms() - tasker->stop_started_ms < 100) return MaaStatus_Running;
    tasker->stop_observed = true;
    return MaaStatus_Succeeded;
  }
  if (id == 0 || id != tasker->active_id) return MaaStatus_Invalid;
  if (scenario("native-hang")) std::this_thread::sleep_for(std::chrono::seconds(10));
  if (scenario("async-hang")) return MaaStatus_Running;
  if (tasker->stopped || scenario("action-fail")) return MaaStatus_Failed;
  if ((scenario("delayed") || scenario("stop-race")) &&
      std::chrono::steady_clock::now() - tasker->started < std::chrono::seconds(2))
    return MaaStatus_Running;
  return MaaStatus_Succeeded;
}
MaaBool MaaTaskerRunning(const MaaTasker* tasker) {
  if (!tasker->stopped) return false;
  if (scenario("stop-invalid") && now_ms() - tasker->stop_started_ms < 100) return true;
  if (scenario("stop-race") && now_ms() - tasker->stop_started_ms < 300) return true;
  tasker->stop_observed = true;
  return false;
}
MaaBool MaaTaskerGetTaskDetail(const MaaTasker*, MaaTaskId, MaaStringBuffer*, MaaNodeId* nodes,
                               MaaSize* size, MaaStatus*) {
  if (!size) return false;
  if (*size && nodes) nodes[0] = 10;
  *size = 1;
  return true;
}
MaaBool MaaTaskerGetNodeDetail(const MaaTasker*, MaaNodeId, MaaStringBuffer*, MaaRecoId* reco,
                               MaaActId* action, MaaBool* completed) {
  if (reco) *reco = 11;
  if (action) *action = 12;
  if (completed) *completed = !scenario("action-rejected");
  return true;
}
MaaBool MaaTaskerGetActionDetail(const MaaTasker*, MaaActId, MaaStringBuffer*, MaaStringBuffer*,
                                 MaaRect*, MaaBool* success, MaaStringBuffer*) {
  if (success) *success = !scenario("action-rejected");
  return true;
}
MaaBool MaaTaskerGetRecognitionDetail(const MaaTasker* tasker, MaaRecoId, MaaStringBuffer*,
                                      MaaStringBuffer*, MaaBool* hit, MaaRect*,
                                      MaaStringBuffer* detail, MaaImageBuffer*,
                                      MaaImageListBuffer*) {
  *hit = !scenario("no-hit");
  Json matches = Json::array();
  if (*hit) {
    Json match{{"box", {10, 20, 80, 30}}, {"score", 0.95}};
    if (tasker->kind == "OCR") match["text"] = "MAA";
    if (tasker->kind == "ColorMatch") {
      match.erase("score");
      match["count"] = 500;
    }
    matches.push_back(match);
    if (scenario("many-matches")) {
      for (int index = 1; index < 257; ++index) matches.push_back(match);
    } else if (scenario("multiple-matches")) {
      match["box"] = {100, 20, 80, 30};
      matches.push_back(match);
    }
  }
  detail->text = Json{{"filtered", matches}, {"all", matches}}.dump();
  return true;
}
MaaBool MaaTaskerClearCache(MaaTasker*) {
  trace("clear-cache");
  return true;
}
MaaController* MaaAdbControllerCreate(const char*, const char*, MaaAdbScreencapMethod capture,
                                      MaaAdbInputMethod input, const char* config,
                                      const char* agents) {
  trace("controller-create:" + std::to_string(input) + ":" + std::to_string(capture) + ":" +
        config + ":" + agents);
  if (input != MaaAdbInputMethod_Maatouch) return nullptr;
  return new MaaController;
}
void MaaControllerDestroy(MaaController* controller) {
  trace("controller-destroy");
  delete controller;
}
MaaCtrlId MaaControllerPostConnection(MaaController* controller) {
  trace("connect");
  controller->connected = !scenario("no-touch");
  return 7;
}
MaaCtrlId MaaControllerPostScreencap(MaaController*) {
  trace("screencap");
  return 7;
}
MaaCtrlId MaaControllerPostClick(MaaController*, int32_t, int32_t) { return 7; }
MaaCtrlId MaaControllerPostClickKey(MaaController*, int32_t) { return 7; }
MaaCtrlId MaaControllerPostTouchUp(MaaController*, int32_t) {
  trace("touch-up");
  return scenario("touch-unsupported") ? 8 : 7;
}
MaaStatus MaaControllerStatus(const MaaController* controller, MaaCtrlId id) {
  if (id == 8 && scenario("touch-unsupported")) return MaaStatus_Failed;
  return controller->connected ? MaaStatus_Succeeded : MaaStatus_Failed;
}
MaaBool MaaControllerConnected(const MaaController* controller) { return controller->connected; }
MaaBool MaaControllerCachedImage(const MaaController*, MaaImageBuffer* image) {
  load_image(image);
  return true;
}
MaaImageBuffer* MaaImageBufferCreate() { return new MaaImageBuffer; }
void MaaImageBufferDestroy(MaaImageBuffer* image) { delete image; }
int32_t MaaImageBufferWidth(const MaaImageBuffer* image) { return image->width; }
int32_t MaaImageBufferHeight(const MaaImageBuffer* image) { return image->height; }
MaaBool MaaImageBufferSetRawData(MaaImageBuffer* image, MaaImageRawData data, int32_t width,
                                 int32_t height, int32_t) {
  image->width = width;
  image->height = height;
  const auto* bytes = static_cast<unsigned char*>(data);
  image->pixels.assign(bytes, bytes + static_cast<std::size_t>(width) * height * 3);
  return true;
}
MaaBool MaaImageBufferSetEncoded(MaaImageBuffer* image, MaaImageEncodedData bytes, MaaSize size) {
  if (size < 24 || scenario("decode-fail")) return false;
  image->width = static_cast<int>(be(bytes + 16));
  image->height = static_cast<int>(be(bytes + 20));
  image->bytes.assign(bytes, bytes + size);
  image->pixels.resize(static_cast<std::size_t>(image->width) * image->height * 3, 255);
  // Boundary values exercise the native grayscale mask, independent of PNG decoding.
  const std::vector<unsigned char> boundary{0, 0, 0, 99, 99, 99, 100, 100, 100, 255, 255, 255};
  if (image->pixels.size() >= boundary.size())
    std::copy(boundary.begin(), boundary.end(), image->pixels.begin());
  for (std::size_t offset = 8; offset + 12 <= size;) {
    const auto length = be(bytes + offset);
    if (length > size - offset - 12) break;
    if (std::string(reinterpret_cast<const char*>(bytes + offset + 4), 4) == "maVr" &&
        length == image->pixels.size())
      std::copy(bytes + offset + 8, bytes + offset + 8 + length, image->pixels.begin());
    offset += length + 12;
  }
  return true;
}
MaaBool MaaImageBufferResize(MaaImageBuffer* image, int32_t width, int32_t height) {
  trace("image-resize:" + std::to_string(width) + ":" + std::to_string(height));
  image->width = width;
  image->height = height;
  image->pixels.resize(static_cast<std::size_t>(width) * height * 3);
  return !scenario("resize-fail");
}
MaaImageRawData MaaImageBufferGetRawData(const MaaImageBuffer* image) {
  return const_cast<unsigned char*>(image->pixels.data());
}
int32_t MaaImageBufferType(const MaaImageBuffer*) { return 16; }
int32_t MaaImageBufferChannels(const MaaImageBuffer*) { return 3; }
MaaImageEncodedData MaaImageBufferGetEncoded(const MaaImageBuffer* image) {
  return const_cast<unsigned char*>(image->bytes.data());
}
MaaSize MaaImageBufferGetEncodedSize(const MaaImageBuffer* image) { return image->bytes.size(); }
MaaStringBuffer* MaaStringBufferCreate() { return new MaaStringBuffer; }
void MaaStringBufferDestroy(MaaStringBuffer* text) { delete text; }
const char* MaaStringBufferGet(const MaaStringBuffer* text) { return text->text.c_str(); }
MaaRect* MaaRectCreate() { return new MaaRect; }
void MaaRectDestroy(MaaRect* box) { delete box; }
}  // extern "C"
