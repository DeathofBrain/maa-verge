// CTest-only MaaFramework C ABI fixture. It never spawns a process or accesses a device.
#include <MaaFramework/MaaAPI.h>
#include <MaaFramework/MaaMsg.h>
#include <nlohmann/json.hpp>

#include <algorithm>
#include <atomic>
#include <chrono>
#include <cstdio>
#include <cstdlib>
#include <fstream>
#include <iterator>
#include <mutex>
#include <map>
#include <memory>
#include <string>
#include <thread>
#include <vector>

using Json = nlohmann::json;
struct MaaResource {
  bool loaded = false;
  MaaCustomActionCallback custom_action = nullptr;
  void* custom_argument = nullptr;
};
struct MaaController {
  bool connected = false;
  MaaAdbInputMethod input = MaaAdbInputMethod_Maatouch;
};
struct MaaTasker {
  MaaController* controller = nullptr;
  MaaResource* resource = nullptr;
  std::atomic<bool> stopped = false;
  mutable std::atomic<bool> stop_observed = true;
  std::atomic<MaaTaskId> next_id = 100;
  std::atomic<MaaTaskId> active_id = 0;
  std::atomic<MaaTaskId> stop_id = 0;
  std::atomic<std::int64_t> stop_started_ms = 0;
  std::chrono::steady_clock::time_point started;
  std::string kind;
  std::string recognition_kind;
  std::thread pipeline_thread;
  std::atomic<MaaStatus> pipeline_status = MaaStatus_Invalid;
  struct TaskDetail {
    MaaStatus status = MaaStatus_Running;
    std::vector<MaaNodeId> nodes;
  };
  std::mutex task_mutex;
  std::map<MaaTaskId, TaskDetail> tasks;
  std::map<MaaNodeId, bool> completed;
  std::atomic<MaaNodeId> next_node = 500;
  MaaEventCallback context_sink = nullptr;
  void* context_argument = nullptr;
};
struct TaskState {
  std::map<std::string, std::size_t> hit_count;
};
struct MaaContext {
  MaaTasker* tasker;
  Json nodes;
  std::shared_ptr<TaskState> state;
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
std::uint32_t be(const unsigned char* data) {
  return (std::uint32_t(data[0]) << 24) | (std::uint32_t(data[1]) << 16) |
         (std::uint32_t(data[2]) << 8) | data[3];
}
void load_image(MaaImageBuffer* image) {
  image->width = 1280;
  image->height = 720;
  if (const auto* path = std::getenv("MAAVERGE_FRAMEWORK_IMAGE")) {
    std::ifstream input(path, std::ios::binary);
    image->bytes.assign(std::istreambuf_iterator<char>(input), std::istreambuf_iterator<char>());
    // 控制器夹具返回真实合成 PNG 的尺寸，允许测试通用 4:3 等非游戏画布。
    if (image->bytes.size() >= 24) {
      image->width = static_cast<int>(be(image->bytes.data() + 16));
      image->height = static_cast<int>(be(image->bytes.data() + 20));
    }
  }
}
/** 合成图仅用于 ABI 行为；根任务异步，Context 子任务在相同调用线程同步运行。 */
bool execute_pipeline(MaaTasker* tasker, MaaTaskId id, const std::string& entry, const Json& nodes,
                      std::shared_ptr<TaskState> state = std::make_shared<TaskState>()) {
  bool success = true;
  {
    std::lock_guard guard(tasker->task_mutex);
    tasker->tasks[id] = {};
  }
  try {
    MaaContext context{tasker, nodes, state};
    auto current = entry;
    for (int visited = 0; visited < 1024 && !current.empty(); ++visited) {
      if (tasker->stopped) {
        success = false;
        break;
      }
      const auto& node = nodes.at(current);
      // 与官方 Context 的克隆一致：父子图共享按节点名计数，入口同样接受 max_hit 检查。
      if (!node.value("enabled", true) ||
          state->hit_count[current] >= node.value("max_hit", std::size_t(-1))) {
        trace("pipeline-max-hit:" + current);
        success = false;
        break;
      }
      ++state->hit_count[current];
      trace("pipeline-node:" + current);
      const auto recognition = node.value("recognition", std::string("DirectHit"));
      if (recognition != "DirectHit")
        trace("pipeline-recognition:" + recognition + ":" + node.dump());
      const auto action = node.value("action", std::string("DoNothing"));
      if (tasker->context_sink) {
        const auto detail = Json{{"task_id", id}, {"name", current}}.dump();
        tasker->context_sink(&context, MaaMsg_Node_Action_Starting, detail.c_str(),
                             tasker->context_argument);
      }
      bool accepted = true;
      if (action == "Custom") {
        if (!tasker->resource->custom_action) throw std::runtime_error("unregistered Custom");
        const auto params = node.value("custom_action_param", Json::object()).dump();
        MaaRect box{0, 0, 10, 10};
        accepted = tasker->resource->custom_action(&context, id, current.c_str(), "MaaVerge.Custom",
                                                   params.c_str(), 11, &box,
                                                   tasker->resource->custom_argument);
      } else if (action != "DoNothing") {
        trace("pipeline-action:" + action + ":" + node.dump());
        accepted = !scenario("action-fail");
      }
      {
        std::lock_guard guard(tasker->task_mutex);
        const auto node_id = tasker->next_node++;
        tasker->tasks[id].nodes.push_back(node_id);
        tasker->completed[node_id] = accepted;
      }
      const auto edges = node.value(accepted ? "next" : "on_error", Json::array());
      if (edges.empty()) {
        success = accepted;
        current.clear();
        break;
      }
      std::string next;
      for (const auto& edge : edges) {
        const auto& candidate = nodes.at(edge.get<std::string>());
        if (candidate.value("enabled", true) &&
            state->hit_count[edge.get<std::string>()] <
                candidate.value("max_hit", std::size_t(-1)) &&
            candidate.value("expected", Json()) != "__miss__" && !scenario("no-hit")) {
          next = edge.get<std::string>();
          break;
        }
      }
      if (next.empty()) {
        success = false;
        break;
      }
      current = next;
      if (visited == 1023) success = false;
    }
  } catch (...) {
    success = false;
  }
  success = success && !tasker->stopped;
  {
    std::lock_guard guard(tasker->task_mutex);
    tasker->tasks[id].status = success ? MaaStatus_Succeeded : MaaStatus_Failed;
  }
  return success;
}
}  // namespace

extern "C" {
#ifndef OMIT_FRAMEWORK_VERSION
const char* MaaVersion() {
  std::puts("synthetic framework stdout: loaded");
  trace("version");
  if (scenario("native-stdout")) std::printf("synthetic native stdout\n");
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
MaaBool MaaResourceRegisterCustomAction(MaaResource* resource, const char* name,
                                        MaaCustomActionCallback callback, void* argument) {
  trace("register-custom:" + std::string(name));
  if (std::string(name) != "MaaVerge.Custom") return false;
  resource->custom_action = callback;
  resource->custom_argument = argument;
  return true;
}
MaaTasker* MaaTaskerCreate() {
  trace("tasker-create");
  return new MaaTasker;
}
void MaaTaskerDestroy(MaaTasker* tasker) {
  if (!tasker->stop_observed) std::abort();
  trace("tasker-destroy-start");
  if (tasker->pipeline_thread.joinable()) tasker->pipeline_thread.join();
  if (scenario("destroy-delay")) std::this_thread::sleep_for(std::chrono::milliseconds(300));
  trace("tasker-destroy-done");
  std::puts("synthetic framework stdout: destroyed");
  delete tasker;
}
MaaBool MaaTaskerBindResource(MaaTasker* tasker, MaaResource* resource) {
  tasker->resource = resource;
  return true;
}
MaaBool MaaTaskerBindController(MaaTasker* tasker, MaaController* controller) {
  trace("bind-controller");
  tasker->controller = controller;
  return true;
}
MaaTaskId MaaTaskerPostRecognition(MaaTasker* tasker, const char* kind, const char* params,
                                   const MaaImageBuffer*) {
  tasker->stopped = false;
  tasker->kind = kind;
  tasker->recognition_kind = kind;
  tasker->started = std::chrono::steady_clock::now();
  trace("recognition:" + std::string(kind) + ":" + params);
  tasker->stop_id = 0;
  return tasker->active_id = tasker->next_id++;
}
MaaSinkId MaaTaskerAddContextSink(MaaTasker* tasker, MaaEventCallback callback, void* argument) {
  tasker->context_sink = callback;
  tasker->context_argument = argument;
  return 1;
}
void MaaTaskerRemoveContextSink(MaaTasker* tasker, MaaSinkId) { tasker->context_sink = nullptr; }
MaaBool MaaContextGetNodeData(MaaContext* context, const char* name, MaaStringBuffer* buffer) {
  const auto found = context->nodes.find(name);
  if (found == context->nodes.end()) return false;
  buffer->text = found->dump();
  return true;
}
MaaTaskId MaaContextRunTask(MaaContext* context, const char* entry, const char* pipeline) {
  const auto id = context->tasker->next_id++;
  auto nodes = context->nodes;
  nodes.update(Json::parse(pipeline));
  trace("context-pipeline:" + std::string(entry));
  execute_pipeline(context->tasker, id, entry, nodes, context->state);
  // 官方即使业务失败也返回有效任务 id；状态必须由调用者读取。
  return id;
}
MaaTaskId MaaTaskerPostTask(MaaTasker* tasker, const char* entry, const char* pipeline) {
  if (!tasker->controller || !tasker->resource || scenario("pipeline-rejected"))
    return MaaInvalidId;
  if (tasker->pipeline_thread.joinable()) tasker->pipeline_thread.join();
  tasker->stopped = false;
  tasker->kind = "Pipeline";
  tasker->pipeline_status = MaaStatus_Running;
  tasker->stop_id = 0;
  const MaaTaskId id = tasker->active_id = tasker->next_id++;
  trace("pipeline:" + std::string(entry));
  tasker->pipeline_thread =
      std::thread([tasker, id, entry = std::string(entry), nodes = Json::parse(pipeline)] {
        const bool success = execute_pipeline(tasker, id, entry, nodes);
        tasker->pipeline_status = success ? MaaStatus_Succeeded : MaaStatus_Failed;
      });
  return id;
}
MaaActId MaaContextRunActionDirect(MaaContext* context, const char* kind, const char* params,
                                   const MaaRect*, const char*) {
  trace("context-action:" + std::string(kind) + ":" + params);
  return context->tasker->stopped || scenario("action-fail") ? MaaInvalidId : 12;
}
MaaRecoId MaaContextRunRecognitionDirect(MaaContext* context, const char* kind, const char* params,
                                         const MaaImageBuffer*) {
  trace("context-recognition:" + std::string(kind) + ":" + params);
  context->tasker->recognition_kind = kind;
  return context->tasker->stopped ? MaaInvalidId : 11;
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
  if (tasker->kind == "Pipeline") return tasker->pipeline_status;
  if (scenario("native-hang")) std::this_thread::sleep_for(std::chrono::seconds(10));
  if (scenario("async-hang")) return MaaStatus_Running;
  if (tasker->stopped || scenario("action-fail")) return MaaStatus_Failed;
  if ((scenario("delayed") || scenario("stop-race")) &&
      std::chrono::steady_clock::now() - tasker->started < std::chrono::seconds(2))
    return MaaStatus_Running;
  return MaaStatus_Succeeded;
}
MaaBool MaaTaskerRunning(const MaaTasker* tasker) {
  if (tasker->kind == "Pipeline" && tasker->pipeline_status == MaaStatus_Running) return true;
  if (!tasker->stopped) return false;
  if (scenario("stop-invalid") && now_ms() - tasker->stop_started_ms < 100) return true;
  if (scenario("stop-race") && now_ms() - tasker->stop_started_ms < 300) return true;
  tasker->stop_observed = true;
  return false;
}
MaaBool MaaTaskerGetTaskDetail(const MaaTasker* tasker, MaaTaskId id, MaaStringBuffer*,
                               MaaNodeId* nodes, MaaSize* size, MaaStatus* status) {
  auto& mutable_tasker = *const_cast<MaaTasker*>(tasker);
  std::lock_guard guard(mutable_tasker.task_mutex);
  const auto found = tasker->tasks.find(id);
  if (found != tasker->tasks.end()) {
    if (status) *status = found->second.status;
    if (size) {
      if (*size && nodes)
        std::copy_n(found->second.nodes.begin(),
                    std::min<std::size_t>(*size, found->second.nodes.size()), nodes);
      *size = found->second.nodes.size();
    }
    return true;
  }
  if (status) *status = MaaStatus_Succeeded;
  if (size) {
    if (*size && nodes) nodes[0] = 10;
    *size = 1;
  }
  return true;
}
MaaBool MaaTaskerGetNodeDetail(const MaaTasker* tasker, MaaNodeId id, MaaStringBuffer*,
                               MaaRecoId* reco, MaaActId* action, MaaBool* completed) {
  if (reco) *reco = 11;
  if (action) *action = 12;
  if (completed) {
    auto& mutable_tasker = *const_cast<MaaTasker*>(tasker);
    std::lock_guard guard(mutable_tasker.task_mutex);
    const auto found = tasker->completed.find(id);
    *completed =
        !scenario("action-rejected") && (found == tasker->completed.end() || found->second);
  }
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
    if (tasker->recognition_kind == "OCR") match["text"] = "MAA";
    if (tasker->recognition_kind == "ColorMatch") {
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
MaaController* MaaAdbControllerCreate(const char*, const char* address,
                                      MaaAdbScreencapMethod capture, MaaAdbInputMethod input,
                                      const char* config, const char* agents) {
  trace("controller-create:" + std::to_string(input) + ":" + std::to_string(capture) + ":" +
        config + ":" + agents);
  trace("controller-address:" + std::string(address));
  if (input != MaaAdbInputMethod_Maatouch && input != MaaAdbInputMethod_MinitouchAndAdbKey &&
      input != MaaAdbInputMethod_AdbShell && input != MaaAdbInputMethod_EmulatorExtras)
    return nullptr;
  return new MaaController{false, input};
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
MaaCtrlId MaaControllerPostStartApp(MaaController*, const char* intent) {
  trace("start-app:" + std::string(intent));
  return scenario("app-rejected") ? MaaInvalidId : 9;
}
MaaCtrlId MaaControllerPostStopApp(MaaController*, const char* app) {
  trace("stop-app:" + std::string(app));
  return scenario("app-rejected") ? MaaInvalidId : 9;
}

MaaCtrlId MaaControllerPostTouchUp(MaaController* controller, int32_t) {
  trace("touch-up");
  return scenario("touch-unsupported") || controller->input == MaaAdbInputMethod_AdbShell ? 8 : 7;
}
MaaStatus MaaControllerStatus(const MaaController* controller, MaaCtrlId id) {
  if (id == 9 && scenario("app-failed")) return MaaStatus_Failed;
  if (id == 9 && scenario("app-hang")) return MaaStatus_Running;
  if (id == 8 && (scenario("touch-unsupported") || controller->input == MaaAdbInputMethod_AdbShell))
    return MaaStatus_Failed;
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
