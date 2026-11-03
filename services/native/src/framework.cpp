#include "framework.hpp"

#include <MaaFramework/MaaAPI.h>
#include <MaaFramework/MaaMsg.h>

#include <algorithm>
#include <array>
#include <cmath>
#include <cstring>
#include <fstream>
#include <functional>
#include <regex>
#include <set>
#include <stdexcept>
#include <system_error>

#ifdef _WIN32
#include <windows.h>
#else
#include <dlfcn.h>
#endif

namespace maaverge {
namespace {
constexpr std::size_t max_image_bytes = 3 * 1024 * 1024 - 8192;
constexpr int max_dimension = 16384;
constexpr std::int64_t max_pixels = 32 * 1024 * 1024;
constexpr auto expected_version = "v5.14.3";
struct NavigationProfile {
  int duration_ms;
  int end_hold_ms;
  int compensation_distance;
  int reference_height;
  int compensation_duration_ms;
};
constexpr NavigationProfile navigation_profile{200, 150, 100, 720, 200};

#define FRAMEWORK_SYMBOLS(X)                                                                       \
  X(MaaVersion)                                                                                    \
  X(MaaGlobalSetOption)                                                                            \
  X(MaaResourceCreate)                                                                             \
  X(MaaResourceDestroy)                                                                            \
  X(MaaResourcePostBundle)                                                                         \
  X(MaaResourceStatus)                                                                             \
  X(MaaResourceLoaded)                                                                             \
  X(MaaResourceSetOption)                                                                          \
  X(MaaResourceOverrideImage)                                                                      \
  X(MaaResourceRegisterCustomAction)                                                               \
  X(MaaTaskerCreate)                                                                               \
  X(MaaTaskerDestroy)                                                                              \
  X(MaaTaskerBindResource)                                                                         \
  X(MaaTaskerBindController)                                                                       \
  X(MaaTaskerPostRecognition)                                                                      \
  X(MaaTaskerPostAction)                                                                           \
  X(MaaTaskerAddContextSink)                                                                       \
  X(MaaTaskerRemoveContextSink)                                                                    \
  X(MaaContextRunTask)                                                                             \
  X(MaaContextGetNodeData)                                                                         \
  X(MaaTaskerPostTask)                                                                             \
  X(MaaContextRunActionDirect)                                                                     \
  X(MaaContextRunRecognitionDirect)                                                                \
  X(MaaTaskerPostStop)                                                                             \
  X(MaaTaskerStatus)                                                                               \
  X(MaaTaskerRunning)                                                                              \
  X(MaaTaskerGetTaskDetail)                                                                        \
  X(MaaTaskerGetNodeDetail)                                                                        \
  X(MaaTaskerGetRecognitionDetail)                                                                 \
  X(MaaTaskerGetActionDetail)                                                                      \
  X(MaaTaskerClearCache)                                                                           \
  X(MaaAdbControllerCreate)                                                                        \
  X(MaaControllerDestroy)                                                                          \
  X(MaaControllerPostConnection)                                                                   \
  X(MaaControllerPostScreencap)                                                                    \
  X(MaaControllerPostClick)                                                                        \
  X(MaaControllerPostStartApp)                                                                     \
  X(MaaControllerPostStopApp)                                                                      \
  X(MaaControllerPostClickKey)                                                                     \
  X(MaaControllerPostTouchUp)                                                                      \
  X(MaaControllerStatus)                                                                           \
  X(MaaControllerConnected)                                                                        \
  X(MaaControllerCachedImage)                                                                      \
  X(MaaImageBufferCreate)                                                                          \
  X(MaaImageBufferDestroy)                                                                         \
  X(MaaImageBufferWidth)                                                                           \
  X(MaaImageBufferHeight)                                                                          \
  X(MaaImageBufferResize)                                                                          \
  X(MaaImageBufferGetRawData)                                                                      \
  X(MaaImageBufferType)                                                                            \
  X(MaaImageBufferChannels)                                                                        \
  X(MaaImageBufferSetRawData)                                                                      \
  X(MaaImageBufferSetEncoded)                                                                      \
  X(MaaImageBufferGetEncoded)                                                                      \
  X(MaaImageBufferGetEncodedSize)                                                                  \
  X(MaaStringBufferCreate)                                                                         \
  X(MaaStringBufferDestroy)                                                                        \
  X(MaaStringBufferGet)                                                                            \
  X(MaaRectCreate)                                                                                 \
  X(MaaRectDestroy)

class FrameworkApi final {
 public:
  explicit FrameworkApi(const fs::path& root) {
#ifdef _WIN32
    const auto directory = root / "bin";
    const auto library_path = directory / "MaaFramework.dll";
#elif defined(__APPLE__)
    const auto library_path = root / "bin" / "libMaaFramework.dylib";
#else
    const auto library_path = root / "bin" / "libMaaFramework.so";
#endif
    if (!fs::is_regular_file(library_path))
      throw std::runtime_error("missing MaaFramework library: " + to_utf8(library_path));
    try {
#ifdef _WIN32
      directory_cookie_ = AddDllDirectory(directory.c_str());
      if (!directory_cookie_)
        throw std::runtime_error("cannot add MaaFramework dependency directory");
      library_ =
          LoadLibraryExW(library_path.c_str(), nullptr,
                         LOAD_LIBRARY_SEARCH_DLL_LOAD_DIR | LOAD_LIBRARY_SEARCH_DEFAULT_DIRS);
      if (!library_)
        throw std::system_error(static_cast<int>(GetLastError()), std::system_category(),
                                "MaaFramework load failed");
#else
      // Official SDK dependencies register process-exit callbacks. Keep their
      // code mapped until exit, after destroying all per-instance state. Each
      // framework engine already runs in its own process.
      library_ = dlopen(library_path.c_str(), RTLD_NOW | RTLD_LOCAL | RTLD_NODELETE);
      if (!library_)
        throw std::runtime_error(std::string("MaaFramework load failed: ") + dlerror());
#endif
#define LOAD(name) name = reinterpret_cast<decltype(name)>(symbol(#name));
      FRAMEWORK_SYMBOLS(LOAD)
#undef LOAD
    } catch (...) {
      unload();
      throw;
    }
  }
  ~FrameworkApi() {
    Deadline deadline("unload MaaFramework", 5000);
    unload();
  }
#define DECLARE(name) decltype(&::name) name = nullptr;
  FRAMEWORK_SYMBOLS(DECLARE)
#undef DECLARE

 private:
  void* symbol(const char* name) {
#ifdef _WIN32
    auto address = reinterpret_cast<void*>(GetProcAddress(static_cast<HMODULE>(library_), name));
#else
    auto address = dlsym(library_, name);
#endif
    if (!address)
      throw std::runtime_error(std::string("missing MaaFramework C API symbol: ") + name);
    return address;
  }
  void unload() noexcept {
#ifdef _WIN32
    if (library_) FreeLibrary(static_cast<HMODULE>(library_));
    if (directory_cookie_) RemoveDllDirectory(directory_cookie_);
    directory_cookie_ = nullptr;
#else
    if (library_) dlclose(library_);
#endif
    library_ = nullptr;
  }
  void* library_ = nullptr;
#ifdef _WIN32
  void* directory_cookie_ = nullptr;
#endif
};

int integer(const Json& value, const char* name, int low, int high) {
  if (!value.contains(name) || !value[name].is_number_integer())
    throw std::runtime_error(std::string("invalid integer: ") + name);
  const auto number = value[name].get<std::int64_t>();
  if (number < low || number > high)
    throw std::runtime_error(std::string("integer out of range: ") + name);
  return static_cast<int>(number);
}

void dimensions(int width, int height) {
  if (width <= 0 || height <= 0 || width > max_dimension || height > max_dimension ||
      static_cast<std::int64_t>(width) * height > max_pixels)
    throw std::runtime_error("image dimensions out of range");
}

std::string encode(const unsigned char* bytes, std::size_t size) {
  constexpr char alphabet[] = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  std::string result;
  result.reserve((size + 2) / 3 * 4);
  for (std::size_t i = 0; i < size; i += 3) {
    const auto left = size - i;
    const auto bits = (unsigned(bytes[i]) << 16) | (left > 1 ? unsigned(bytes[i + 1]) << 8 : 0) |
                      (left > 2 ? unsigned(bytes[i + 2]) : 0);
    result += alphabet[(bits >> 18) & 63];
    result += alphabet[(bits >> 12) & 63];
    result += left > 1 ? alphabet[(bits >> 6) & 63] : '=';
    result += left > 2 ? alphabet[bits & 63] : '=';
  }
  return result;
}

std::vector<unsigned char> decode(const std::string& text) {
  if (text.empty() || text.size() % 4 != 0 || text.size() > (max_image_bytes + 2) / 3 * 4)
    throw std::runtime_error("invalid base64 image size");
  std::vector<unsigned char> result;
  result.reserve(text.size() / 4 * 3);
  auto digit = [](char character) -> unsigned {
    const std::string alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    const auto index = alphabet.find(character);
    if (index == std::string::npos) throw std::runtime_error("invalid base64 image");
    return static_cast<unsigned>(index);
  };
  for (std::size_t i = 0; i < text.size(); i += 4) {
    const bool pad2 = text[i + 2] == '=';
    const bool pad3 = text[i + 3] == '=';
    if ((pad2 || pad3) && i + 4 != text.size()) throw std::runtime_error("invalid base64 padding");
    if (pad2 && !pad3) throw std::runtime_error("invalid base64 padding");
    const auto a = digit(text[i]), b = digit(text[i + 1]);
    const auto c = pad2 ? 0 : digit(text[i + 2]), d = pad3 ? 0 : digit(text[i + 3]);
    if ((pad2 && (b & 15)) || (pad3 && !pad2 && (c & 3)))
      throw std::runtime_error("noncanonical base64 padding");
    const auto bits = (a << 18) | (b << 12) | (c << 6) | d;
    result.push_back(static_cast<unsigned char>(bits >> 16));
    if (!pad2) result.push_back(static_cast<unsigned char>(bits >> 8));
    if (!pad3) result.push_back(static_cast<unsigned char>(bits));
  }
  if (result.size() > max_image_bytes) throw std::runtime_error("image exceeds transport limit");
  return result;
}

std::uint32_t big_endian(const unsigned char* bytes) {
  return (std::uint32_t(bytes[0]) << 24) | (std::uint32_t(bytes[1]) << 16) |
         (std::uint32_t(bytes[2]) << 8) | std::uint32_t(bytes[3]);
}

void png_header(const std::vector<unsigned char>& bytes, int width, int height) {
  constexpr std::array<unsigned char, 8> signature{137, 80, 78, 71, 13, 10, 26, 10};
  if (bytes.size() < 33 || !std::equal(signature.begin(), signature.end(), bytes.begin()) ||
      std::memcmp(bytes.data() + 12, "IHDR", 4) != 0 || big_endian(bytes.data() + 8) != 13 ||
      big_endian(bytes.data() + 16) != static_cast<unsigned>(width) ||
      big_endian(bytes.data() + 20) != static_cast<unsigned>(height))
    throw std::runtime_error("image must be PNG with matching dimensions");
}

bool contained(const fs::path& parent, const fs::path& child) {
  auto p = parent.begin(), c = child.begin();
  for (; p != parent.end(); ++p, ++c) {
    if (c == child.end() || *p != *c) return false;
  }
  return c != child.end();
}

Json accepted() { return {{"accepted", true}, {"nativeSuccess", true}}; }

struct AdbConfiguration {
  MaaAdbInputMethod input = MaaAdbInputMethod_Maatouch;
  MaaAdbScreencapMethod capture =
      MaaAdbScreencapMethod_Default & ~MaaAdbScreencapMethod_EmulatorExtras;
  Json extras = Json::object();
};

Json emulator_extras(const Json& value) {
  const auto text = required_string(value, "emulatorPath");
  if (!from_utf8(text).is_absolute())
    throw std::runtime_error("emulatorPath must be an absolute directory");
  const auto directory = absolute_path(text);
  if (!fs::is_directory(directory))
    throw std::runtime_error("emulatorPath must be an existing directory");
  auto sdk_path = to_utf8(fs::canonical(directory));
#ifdef _WIN32
  // The emulator SDK parses the path itself and does not accept Win32's
  // extended-path prefix, even though our native filesystem checks do.
  if (sdk_path.starts_with("\\\\?\\UNC\\"))
    sdk_path = "\\\\" + sdk_path.substr(8);
  else if (sdk_path.starts_with("\\\\?\\"))
    sdk_path.erase(0, 4);
#endif
  return {
      {"enable", true}, {"path", sdk_path}, {"index", integer(value, "instanceIndex", 0, 65535)}};
}

AdbConfiguration adb_configuration(const Json& config) {
  AdbConfiguration result;
  const auto mode =
      config.contains("touchMode") ? required_string(config, "touchMode") : std::string("maatouch");
  if (mode == "maatouch")
    result.input = MaaAdbInputMethod_Maatouch;
  else if (mode == "minitouch")
    result.input = MaaAdbInputMethod_MinitouchAndAdbKey;
  else if (mode == "adb")
    result.input = MaaAdbInputMethod_AdbShell;
  else if (mode == "emulator-extras")
    result.input = MaaAdbInputMethod_EmulatorExtras;
  else
    throw std::runtime_error("unsupported MaaFramework touchMode");
  if (config.contains("capture") && !config["capture"].is_object())
    throw std::runtime_error("capture must be an object");
  const auto method = config.contains("capture")   ? required_string(config["capture"], "method")
                      : config.value("avd", false) ? "avd"
                                                   : "auto";
  if (method == "auto") {
    result.capture |= MaaAdbScreencapMethod_EmulatorExtras;
    result.extras["extras"]["avd"]["enable"] = true;
  } else if (method == "avd") {
    result.capture = MaaAdbScreencapMethod_EmulatorExtras;
    result.extras["extras"]["avd"]["enable"] = true;
  } else if (method == "mumu" || method == "ldplayer") {
    result.capture = MaaAdbScreencapMethod_EmulatorExtras;
    auto extras = emulator_extras(config["capture"]);
    if (method == "ldplayer") {
      if (!config["capture"].contains("pid") || !config["capture"]["pid"].is_number_integer() ||
          config["capture"]["pid"].get<std::int64_t>() <= 0 ||
          config["capture"]["pid"].get<std::int64_t>() > 2147483647)
        throw std::runtime_error("LDPlayer capture requires a positive signed 32-bit pid");
      extras["pid"] = config["capture"]["pid"];
    }
    result.extras["extras"][method == "mumu" ? "mumu" : "ld"] = std::move(extras);
  } else if (method != "adb") {
    throw std::runtime_error("unsupported MaaFramework capture method");
  }
  if (config.contains("avdSerial")) {
    const auto serial = required_string(config, "avdSerial");
    constexpr auto prefix = "emulator-";
    const auto port = serial.substr(std::min(serial.size(), std::strlen(prefix)));
    if (!serial.starts_with(prefix) || port.empty() || port.size() > 5 || port.front() == '0' ||
        !std::all_of(port.begin(), port.end(),
                     [](char digit) { return digit >= '0' && digit <= '9'; }) ||
        std::stoi(port) > 65534)
      throw std::runtime_error("avdSerial must be emulator-1 through emulator-65534");
    if (method != "auto" && method != "avd")
      throw std::runtime_error("avdSerial requires auto or avd capture");
    // A TCP ADB transport cannot address the emulator console. The backend
    // verifies this alternate console identity; keep the controller and device
    // lease on the original address and override only these two fixed commands.
    result.extras["command"]["EmuWebrtcStart"] = {"{ADB}", "-s", serial, "emu",
                                                  "screenrecord webrtc start"};
    result.extras["command"]["EmuWebrtcStop"] = {"{ADB}", "-s", serial, "emu",
                                                 "screenrecord webrtc stop"};
  }
  if (config.contains("touchExtras") && !config["touchExtras"].is_object())
    throw std::runtime_error("touchExtras must be an object");
  if (mode == "emulator-extras") {
    // v5.14.3 shares one extras configuration between its capture/input agents.
    // Enabling MuMu input while selecting another emulator's capture would
    // silently add MuMu to that capture agent's candidates. Reject that
    // contradictory device configuration instead of changing screenshot mode.
    if (method != "adb" && method != "mumu")
      throw std::runtime_error("MuMu input extras require adb or mumu capture on the same device");
    if (!config.contains("touchExtras"))
      throw std::runtime_error("MuMu input extras require touchExtras configuration");
    auto extras = emulator_extras(config["touchExtras"]);
    if (method == "mumu" && result.extras["extras"]["mumu"] != extras)
      throw std::runtime_error("MuMu capture and input extras must identify the same instance");
    result.extras["extras"]["mumu"] = std::move(extras);
  }
  return result;
}
}  // namespace

struct Framework::Impl {
  explicit Impl(const Json& config)
      : config(config), sdk(fs::canonical(absolute_path(required_string(config, "framework")))),
        root(fs::canonical(absolute_path(required_string(config, "resource")))), api(sdk),
        timeout(duration_ms(config, "asyncTimeoutMs", 30000)) {
    const auto selected_mode = required_string(config, "mode");
    if (selected_mode != "recognition" && selected_mode != "control")
      throw std::runtime_error("invalid framework mode");
    control = selected_mode == "control";
    if (!control &&
        (config.contains("adb") || config.contains("address") || config.contains("lockPath") ||
         config.contains("avd") || config.contains("avdSerial") || config.contains("touchMode") ||
         config.contains("capture") || config.contains("touchExtras")))
      throw std::runtime_error("recognition mode forbids controller configuration");
    if (timeout == 0) throw std::runtime_error("asyncTimeoutMs must be positive");
    shutdown_timeout = duration_ms(config, "shutdownTimeoutMs", 5000);
    if (shutdown_timeout == 0) throw std::runtime_error("shutdownTimeoutMs must be positive");
    call_timeout = duration_ms(config, "nativeCallTimeoutMs", 90000);
    if (call_timeout == 0) throw std::runtime_error("nativeCallTimeoutMs must be positive");
    if (config.contains("avd") && !config["avd"].is_boolean())
      throw std::runtime_error("avd must be boolean");
    const char* actual = api.MaaVersion();
    if (!actual) throw std::runtime_error("MaaFramework returned null version");
    version = actual;
    if (version != expected_version && version != "5.14.3")
      throw std::runtime_error("MaaFramework version mismatch: expected v5.14.3, got " + version);
    version = expected_version;
    try {
      const auto user = absolute_path(required_string(config, "userDir"));
      fs::create_directories(user);
      auto user_text = to_utf8(fs::canonical(user));
      if (!api.MaaGlobalSetOption(MaaGlobalOption_LogDir, user_text.data(), user_text.size()))
        throw std::runtime_error("cannot set MaaFramework log directory");
      bool disabled = false;
      for (auto option :
           {MaaGlobalOption_SaveDraw, MaaGlobalOption_DebugMode, MaaGlobalOption_SaveOnError}) {
        if (!api.MaaGlobalSetOption(option, &disabled, sizeof(disabled)))
          throw std::runtime_error("cannot disable MaaFramework image persistence");
      }
      resource = api.MaaResourceCreate();
      tasker = api.MaaTaskerCreate();
      if (!resource || !tasker)
        throw std::runtime_error("cannot create MaaFramework resource/tasker");
      context_sink = api.MaaTaskerAddContextSink(tasker, context_event, this);
      if (context_sink == MaaInvalidId) throw std::runtime_error("cannot register context sink");
      if (!api.MaaResourceRegisterCustomAction(resource, "MaaVerge.Custom", custom_action, this))
        throw std::runtime_error("cannot register Maa Verge custom action");
      MaaInferenceExecutionProvider provider = MaaInferenceExecutionProvider_CPU;
      if (!api.MaaResourceSetOption(resource, MaaResOption_InferenceExecutionProvider, &provider,
                                    sizeof(provider)))
        throw std::runtime_error("cannot select CPU inference provider");
      const auto path = to_utf8(root);
      await(
          api.MaaResourcePostBundle(resource, path.c_str()),
          [&](auto id) { return api.MaaResourceStatus(resource, id); }, "load resource");
      if (!api.MaaResourceLoaded(resource) || !api.MaaTaskerBindResource(tasker, resource))
        throw std::runtime_error("MaaFramework resource binding failed");
      if (control) {
        const auto adb = required_string(config, "adb");
        const auto address = required_string(config, "address");
        const auto options = adb_configuration(config);
        const auto extras_text = options.extras.dump();
        const auto agent = to_utf8(sdk / "share" / "MaaAgentBinary");
        controller = api.MaaAdbControllerCreate(adb.c_str(), address.c_str(), options.capture,
                                                options.input, extras_text.c_str(), agent.c_str());
        if (!controller || !api.MaaTaskerBindController(tasker, controller))
          throw std::runtime_error("cannot create MaaFramework controller (no backend fallback)");
      }
    } catch (...) {
      close();
      throw;
    }
  }

  ~Impl() { close(); }

  /** 标准 Pipeline 输入可能绕过宿主动作端口；动作开始即废弃其前的帧证据。 */
  static void MAA_CALL context_event(void* handle, const char* message, const char* details,
                                     void* argument) noexcept {
    auto& self = *static_cast<Impl*>(argument);
    if (!message || std::strcmp(message, MaaMsg_Node_Action_Starting) != 0) return;
    try {
      const auto event = Json::parse(details ? details : "{}");
      const auto name = event.value("name", std::string());
      // Direct 动作的匿名节点由宿主原始动作门禁失效；这里处理有名的标准节点。
      if (name.empty()) return;
      std::unique_ptr<MaaStringBuffer, decltype(self.api.MaaStringBufferDestroy)> buffer(
          self.api.MaaStringBufferCreate(), self.api.MaaStringBufferDestroy);
      if (!buffer || !self.api.MaaContextGetNodeData(static_cast<MaaContext*>(handle), name.c_str(),
                                                     buffer.get()))
        throw std::runtime_error("cannot inspect active action node");
      const auto node = Json::parse(self.api.MaaStringBufferGet(buffer.get()));
      auto action = node.value("action", Json("DoNothing"));
      if (action.is_object()) action = action.value("type", Json("DoNothing"));
      if (!action.is_string()) throw std::runtime_error("invalid active action type");
      if (action != "DoNothing" && action != "Custom") ++self.input_epoch;
    } catch (...) {
      // 无法确定是否输入时保守前进；回调不得向官方 ABI 抛出异常。
      ++self.input_epoch;
    }
  }

  struct PipelineCall {
    std::string id;
    std::string parent_callback;
    Json nodes;
    Json native_nodes;
    Json original_names;
    std::size_t depth;
  };
  struct CustomCall {
    std::string id;
    std::shared_ptr<PipelineCall> pipeline;
    std::queue<Json> commands;
    bool child_pending = false;
    bool failed = false;
  };

  /** 只允许当前栈顶回调收命令；挂起父层和已退出的异步链均无操作权。 */
  void dispatch_custom(const Json& command) {
    std::lock_guard guard(custom_mutex);
    const auto id = required_string(command, "callbackId");
    if (id.size() > 128 || custom_calls.empty() || cancelled || id != custom_calls.back()->id ||
        custom_calls.back()->child_pending)
      throw std::runtime_error("custom callback is no longer active");
    auto& call = *custom_calls.back();
    const auto operation = required_string(command, "operation");
    // 父上下文恢复后仍可观察和回执；已知子失败不授权继续写入设备。
    if (call.failed && operation != "frame" && operation != "recognize" &&
        operation != "custom_result")
      throw std::runtime_error("context task failed; further input forbidden");
    if (call.commands.size() >= 16)
      throw std::runtime_error("custom callback command queue is full");
    if (command.value("operation", std::string()) == "context_pipeline") call.child_pending = true;
    call.commands.push(command);
    custom_condition.notify_all();
  }

  /** Custom 与 TypeScript 通过同一 NDJSON 通道协作；子任务仍在原生回调线程同步执行。 */
  static MaaBool MAA_CALL custom_action(MaaContext* context, MaaTaskId, const char* node,
                                        const char*, const char* params, MaaRecoId, const MaaRect*,
                                        void* argument) noexcept {
    auto& self = *static_cast<Impl*>(argument);
    try {
      return self.run_custom(context, node, params);
    } catch (const std::exception& error) {
      std::fprintf(stderr, "Maa Verge custom action failed: %s\n", error.what());
      return false;
    } catch (...) {
      return false;
    }
  }

  void emit_epoch() {
    if (sender) sender({{"type", "framework_input_epoch"}, {"inputEpoch", input_epoch.load()}});
  }

  bool run_custom(MaaContext* context, const char* node, const char* parameters) {
    const auto params = Json::parse(parameters ? parameters : "{}", nullptr, false);
    if (!sender || !execute || !params.is_object() || params.size() > 64 ||
        params.dump().size() > 64 * 1024)
      throw std::runtime_error("invalid custom action parameters");
    auto call = std::make_shared<CustomCall>();
    call->id = "custom-" + std::to_string(++custom_sequence);
    {
      std::lock_guard guard(custom_mutex);
      if (pipeline_calls.empty() || cancelled ||
          (!custom_calls.empty() && !custom_calls.back()->child_pending))
        return false;
      call->pipeline = pipeline_calls.back();
      const auto original = call->pipeline->original_names.find(node ? node : "");
      if (original == call->pipeline->original_names.end() || !original->is_string())
        throw std::runtime_error("custom callback names an unsubmitted native node");
      const auto found = call->pipeline->nodes.find(original->get<std::string>());
      if (found == call->pipeline->nodes.end() || found->value("action", Json()) != "Custom" ||
          found->value("custom_action", Json()) != "MaaVerge.Custom" ||
          found->value("custom_action_param", Json()) != params)
        throw std::runtime_error("custom callback differs from submitted graph");
      custom_calls.push_back(call);
    }
    const auto previous_context = current_context;
    const auto clear = [&] {
      current_context = previous_context;
      std::lock_guard guard(custom_mutex);
      if (!custom_calls.empty() && custom_calls.back() == call) custom_calls.pop_back();
      while (!call->commands.empty()) {
        const auto command = std::move(call->commands.front());
        call->commands.pop();
        sender({{"type", "response"},
                {"id", command["id"]},
                {"error", "custom callback ended; result unknown"}});
      }
    };
    try {
      sender({{"type", "framework_custom"},
              {"callbackId", call->id},
              {"contextId", call->pipeline->id},
              {"depth", call->pipeline->depth},
              {"parentCallbackId", call->pipeline->parent_callback.empty()
                                       ? Json(nullptr)
                                       : Json(call->pipeline->parent_callback)},
              {"inputEpoch", input_epoch.load()},
              {"node", call->pipeline->original_names.at(node ? node : "")},
              {"params", params}});
      current_context = context;
      bool success = false;
      while (!cancelled && std::chrono::steady_clock::now() < root_expires) {
        Json command;
        {
          std::unique_lock guard(custom_mutex);
          custom_condition.wait_for(guard, std::chrono::milliseconds(20),
                                    [&] { return cancelled || !call->commands.empty(); });
          if (cancelled) break;
          if (call->commands.empty()) continue;
          command = std::move(call->commands.front());
          call->commands.pop();
        }
        const auto operation = required_string(command, "operation");
        try {
          if (operation == "custom_result") {
            if (!command.contains("success") || !command["success"].is_boolean())
              throw std::runtime_error("custom result requires boolean success");
            success = command["success"].get<bool>() && !call->failed;
            sender({{"type", "response"}, {"id", command["id"]}, {"result", accepted()}});
            break;
          }
          static const std::set<std::string> allowed{
              "frame", "recognize",        "click",     "swipe",   "press_key", "long_press",
              "drag",  "context_pipeline", "start_app", "stop_app"};
          if (!allowed.contains(operation))
            throw std::runtime_error("unsupported operation in custom context");
          const auto result = execute(command);
          if (operation == "context_pipeline") {
            {
              std::lock_guard guard(custom_mutex);
              call->child_pending = false;
            }
            emit_epoch();
          }
          sender({{"type", "response"}, {"id", command["id"]}, {"result", result}});
        } catch (const std::exception& error) {
          if (operation == "context_pipeline") {
            {
              std::lock_guard guard(custom_mutex);
              call->child_pending = false;
              call->failed = true;
            }
            emit_epoch();
          }
          sender({{"type", "response"}, {"id", command["id"]}, {"error", error.what()}});
        }
      }
      clear();
      return success && !cancelled;
    } catch (...) {
      clear();
      throw;
    }
  }

  MaaTaskId request_stop() {
    std::lock_guard guard(lifecycle);
    cancelled = true;
    custom_condition.notify_all();
    // Native PostStop clears all earlier action and stop statuses. Cancellation,
    // failure cleanup and shutdown must share this id until the next command.
    if (!stop_posted) {
      stop_posted = true;
      stop_id = tasker ? api.MaaTaskerPostStop(tasker) : MaaInvalidId;
    }
    return stop_id;
  }

  void cleanup_touch() noexcept {
    request_stop();
    if (controller) api.MaaControllerPostTouchUp(controller, 0);
  }

  void close() noexcept {
    if (!tasker && !controller && !resource) return;
    Deadline deadline("destroy MaaFramework", shutdown_timeout);
    if (tasker) {
      const auto pending_stop = request_stop();
      if (pending_stop != MaaInvalidId) {
        while (true) {
          const auto status = api.MaaTaskerStatus(tasker, pending_stop);
          if (status != MaaStatus_Pending && status != MaaStatus_Running) break;
          std::this_thread::sleep_for(std::chrono::milliseconds(5));
        }
      }
      // A disconnected controller can make PostStop reject its final empty
      // task. Its earlier cancellation may still be draining the runner.
      while (api.MaaTaskerRunning(tasker))
        std::this_thread::sleep_for(std::chrono::milliseconds(5));
      if (controller && api.MaaControllerConnected(controller)) {
        const auto release = api.MaaControllerPostTouchUp(controller, 0);
        if (release != MaaInvalidId) {
          while (true) {
            const auto status = api.MaaControllerStatus(controller, release);
            if (status != MaaStatus_Pending && status != MaaStatus_Running) break;
            std::this_thread::sleep_for(std::chrono::milliseconds(5));
          }
        }
      }
      api.MaaTaskerDestroy(tasker);
      tasker = nullptr;
    }
    if (controller) {
      api.MaaControllerDestroy(controller);
      controller = nullptr;
    }
    if (resource) {
      api.MaaResourceDestroy(resource);
      resource = nullptr;
    }
  }

  MaaStatus await(MaaId id, const std::function<MaaStatus(MaaId)>& status, const char* operation,
                  bool allow_failure = false, int timeout_override = 0) {
    if (id == MaaInvalidId)
      throw std::runtime_error(std::string("MaaFramework rejected ") + operation);
    Deadline deadline(operation, timeout_override ? timeout_override : timeout,
                      [this] { cleanup_touch(); });
    while (true) {
      const auto state = status(id);
      if (state == MaaStatus_Succeeded) return state;
      if (state != MaaStatus_Pending && state != MaaStatus_Running) {
        if (allow_failure && state == MaaStatus_Failed && !cancelled) return state;
        throw std::runtime_error(std::string(cancelled ? "cancelled: " : "MaaFramework failed: ") +
                                 operation);
      }
      std::this_thread::sleep_for(std::chrono::milliseconds(5));
    }
  }

  void require_control(bool connected = true) {
    if (!control || !controller)
      throw std::runtime_error("recognition mode forbids device operations");
    if (connected && !api.MaaControllerConnected(controller))
      throw std::runtime_error("MaaFramework controller must be connected");
  }

  void point(int x, int y) const {
    if (width <= 0 || height <= 0)
      throw std::runtime_error("a fresh frame is required before control");
    if (x < 0 || y < 0 || x >= width || y >= height)
      throw std::runtime_error("control coordinates outside last frame");
  }

  Json action(const char* kind, const Json& params) {
    const auto text = params.dump();
    std::unique_ptr<MaaRect, decltype(api.MaaRectDestroy)> box(api.MaaRectCreate(),
                                                               api.MaaRectDestroy);
    if (!box) throw std::runtime_error("cannot create MaaFramework action box");
    if (current_context) {
      if (cancelled) throw std::runtime_error("cancelled before custom context action");
      const auto id =
          api.MaaContextRunActionDirect(current_context, kind, text.c_str(), box.get(), "{}");
      MaaBool success = false;
      if (id == MaaInvalidId || cancelled ||
          !api.MaaTaskerGetActionDetail(tasker, id, nullptr, nullptr, nullptr, &success, nullptr) ||
          !success)
        throw std::runtime_error("custom context action acknowledgment failed");
      return accepted();
    }
    MaaTaskId id;
    {
      std::lock_guard guard(lifecycle);
      if (cancelled) throw std::runtime_error("cancelled before MaaFramework action");
      id = api.MaaTaskerPostAction(tasker, kind, text.c_str(), box.get(), "{}");
    }
    try {
      await(id, [&](auto item) { return api.MaaTaskerStatus(tasker, item); }, kind);
      MaaSize count = 0;
      if (!api.MaaTaskerGetTaskDetail(tasker, id, nullptr, nullptr, &count, nullptr) ||
          count == 0 || count > 1024)
        throw std::runtime_error("MaaFramework action returned no node detail");
      std::vector<MaaNodeId> nodes(count);
      if (!api.MaaTaskerGetTaskDetail(tasker, id, nullptr, nodes.data(), &count, nullptr))
        throw std::runtime_error("cannot read MaaFramework action task detail");
      MaaActId action_id = MaaInvalidId;
      MaaBool completed = false, success = false;
      if (!api.MaaTaskerGetNodeDetail(tasker, nodes.back(), nullptr, nullptr, &action_id,
                                      &completed) ||
          action_id == MaaInvalidId ||
          !api.MaaTaskerGetActionDetail(tasker, action_id, nullptr, nullptr, nullptr, &success,
                                        nullptr) ||
          !completed || !success)
        throw std::runtime_error("MaaFramework action acknowledgment failed");
    } catch (...) {
      cleanup_touch();
      throw;
    }
    if (cancelled) throw std::runtime_error("cancelled MaaFramework action");
    {
      std::lock_guard guard(lifecycle);
      if (!cancelled) api.MaaTaskerClearCache(tasker);
    }
    return accepted();
  }

  Json frame() {
    require_control();
    await(
        api.MaaControllerPostScreencap(controller),
        [&](auto id) { return api.MaaControllerStatus(controller, id); }, "screencap");
    std::unique_ptr<MaaImageBuffer, decltype(api.MaaImageBufferDestroy)> image(
        api.MaaImageBufferCreate(), api.MaaImageBufferDestroy);
    if (!image || !api.MaaControllerCachedImage(controller, image.get()))
      throw std::runtime_error("cannot read MaaFramework frame");
    width = api.MaaImageBufferWidth(image.get());
    height = api.MaaImageBufferHeight(image.get());
    dimensions(width, height);
    const auto size = api.MaaImageBufferGetEncodedSize(image.get());
    auto* bytes = api.MaaImageBufferGetEncoded(image.get());
    if (!bytes || size == 0 || size > max_image_bytes)
      throw std::runtime_error("MaaFramework frame exceeds transport limit");
    const std::vector<unsigned char> copy(bytes, bytes + size);
    png_header(copy, width, height);
    return {{"width", width},
            {"height", height},
            {"mimeType", "image/png"},
            {"data", encode(copy.data(), copy.size())},
            {"canControl", !cancelled.load()}};
  }

  std::string template_path(const Json& command) {
    auto name = required_string(command, "template");
    const auto relative = from_utf8(name);
    if (relative.is_absolute() || name.find('\\') != std::string::npos ||
        name.find(':') != std::string::npos)
      throw std::runtime_error("template must be a resource image relative path");
    for (const auto& part : relative) {
      if (part == ".." || part == ".") throw std::runtime_error("invalid template path segment");
    }
    const auto images = fs::canonical(root / "image");
    const auto target = fs::canonical(images / relative);
    if (!contained(images, target) || !fs::is_regular_file(target))
      throw std::runtime_error("template escapes the resource image directory");
    return to_utf8(relative);
  }

  std::string masked_template(const Json& command) {
    const auto& range = command["maskRange"];
    if (!range.is_array() || range.size() != 2 || !range[0].is_number_integer() ||
        !range[1].is_number_integer() || range[1] != 255 || (range[0] != 1 && range[0] != 100))
      throw std::runtime_error("unsupported template maskRange; expected [1,255] or [100,255]");
    const auto name = template_path(command);
    const auto low = range[0].get<int>();
    const auto derived = "__maaverge_gray_mask_" + std::to_string(low) + "/" + name;
    if (masked_templates.contains(derived)) return derived;
    if (masked_templates.size() >= 128)
      throw std::runtime_error("masked template cache limit reached");
    const auto filename = root / "image" / from_utf8(name);
    const auto length = fs::file_size(filename);
    if (length == 0 || length > 16 * 1024 * 1024)
      throw std::runtime_error("masked template file size is invalid");
    std::ifstream input(filename, std::ios::binary);
    std::vector<unsigned char> encoded(static_cast<std::size_t>(length));
    if (!input.read(reinterpret_cast<char*>(encoded.data()), static_cast<std::streamsize>(length)))
      throw std::runtime_error("cannot read masked template");
    std::unique_ptr<MaaImageBuffer, decltype(api.MaaImageBufferDestroy)> image(
        api.MaaImageBufferCreate(), api.MaaImageBufferDestroy);
    if (!image || !api.MaaImageBufferSetEncoded(image.get(), encoded.data(), encoded.size()))
      throw std::runtime_error("cannot decode masked template");
    const auto w = api.MaaImageBufferWidth(image.get()), h = api.MaaImageBufferHeight(image.get());
    dimensions(w, h);
    if (api.MaaImageBufferChannels(image.get()) != 3 || api.MaaImageBufferType(image.get()) != 16)
      throw std::runtime_error("masked template must decode to 8-bit BGR");
    const auto* raw = static_cast<const unsigned char*>(api.MaaImageBufferGetRawData(image.get()));
    if (!raw) throw std::runtime_error("masked template has no pixels");
    std::vector<unsigned char> pixels(raw, raw + static_cast<std::size_t>(w) * h * 3);
    std::size_t kept = 0;
    for (std::size_t offset = 0; offset < pixels.size(); offset += 3) {
      const auto blue = pixels[offset], green = pixels[offset + 1], red = pixels[offset + 2];
      // OpenCV's 8-bit BGR2GRAY coefficients, matching MaaCore Matcher::templGray.
      const auto gray = (1868 * blue + 9617 * green + 4899 * red + 8192) >> 14;
      if (gray >= low) {
        if (blue == 0 && green == 255 && red == 0)
          throw std::runtime_error("source template contains an ambiguous green mask pixel");
        ++kept;
      } else {
        pixels[offset] = 0;
        pixels[offset + 1] = 255;
        pixels[offset + 2] = 0;
      }
    }
    if (kept == 0) throw std::runtime_error("maskRange excludes every template pixel");
    if (!api.MaaImageBufferSetRawData(image.get(), pixels.data(), w, h, 16) ||
        !api.MaaResourceOverrideImage(resource, derived.c_str(), image.get()))
      throw std::runtime_error("cannot register in-memory masked template");
    masked_templates.insert(derived);
    return derived;
  }

  using RgbRange = std::array<std::array<int, 3>, 2>;
  std::vector<unsigned char> rgb_mask(MaaImageBuffer* image, const std::array<int, 4>& roi,
                                      const std::vector<RgbRange>& ranges, bool close) {
    if (api.MaaImageBufferChannels(image) != 3 || api.MaaImageBufferType(image) != 16)
      throw std::runtime_error("RGBCount requires decoded 8-bit BGR images");
    const auto* raw = static_cast<const unsigned char*>(api.MaaImageBufferGetRawData(image));
    if (!raw) throw std::runtime_error("RGBCount image has no pixels");
    const auto stride = api.MaaImageBufferWidth(image);
    const auto [left, top, w, h] = roi;
    std::vector<unsigned char> mask(static_cast<std::size_t>(w) * h);
    for (int y = 0; y < h; ++y) {
      if (cancelled) throw std::runtime_error("cancelled RGBCount recognition");
      for (int x = 0; x < w; ++x) {
        const auto offset = (static_cast<std::size_t>(top + y) * stride + left + x) * 3;
        for (const auto& range : ranges) {
          bool active = true;
          for (int channel = 0; channel < 3; ++channel) {
            const auto value = raw[offset + 2 - channel];  // MaaCore counts RGB, buffers are BGR.
            active = active && value >= range[0][channel] && value <= range[1][channel];
          }
          if (active) {
            mask[static_cast<std::size_t>(y) * w + x] = 1;
            break;
          }
        }
      }
    }
    if (!close) return mask;
    // OpenCV MORPH_CLOSE with the source's 3x3 rectangular kernel. Neutral borders
    // are 0 for dilation and 1 for erosion, including when the ROI touches an edge.
    std::vector<unsigned char> dilated(mask.size()), closed(mask.size());
    for (int y = 0; y < h; ++y) {
      if (cancelled) throw std::runtime_error("cancelled RGBCount recognition");
      for (int x = 0; x < w; ++x) {
        unsigned char value = 0;
        for (int dy = -1; dy <= 1; ++dy)
          for (int dx = -1; dx <= 1; ++dx)
            if (y + dy >= 0 && y + dy < h && x + dx >= 0 && x + dx < w)
              value |= mask[static_cast<std::size_t>(y + dy) * w + x + dx];
        dilated[static_cast<std::size_t>(y) * w + x] = value;
      }
    }
    for (int y = 0; y < h; ++y) {
      if (cancelled) throw std::runtime_error("cancelled RGBCount recognition");
      for (int x = 0; x < w; ++x) {
        unsigned char value = 1;
        for (int dy = -1; dy <= 1; ++dy)
          for (int dx = -1; dx <= 1; ++dx)
            if (y + dy >= 0 && y + dy < h && x + dx >= 0 && x + dx < w)
              value &= dilated[static_cast<std::size_t>(y + dy) * w + x + dx];
        closed[static_cast<std::size_t>(y) * w + x] = value;
      }
    }
    return closed;
  }

  Json rgb_count(MaaImageBuffer* image, const Json& command, const Json& params) {
    // Explicit, bounded port of MaaCore v6.20.0 Matcher::preproc_and_match's
    // RGBCount/pureColor branch and MultiMatcher::analyze. No Ccoeff substitute.
    if (!command.contains("pureColor") || command["pureColor"] != true)
      throw std::runtime_error("RGBCount supports only explicit pureColor:true");
    if (command.contains("maskRange") || command.contains("greenMask"))
      throw std::runtime_error("RGBCount does not accept template masks");
    if (!command.contains("colorScales") || !command["colorScales"].is_array() ||
        command["colorScales"].empty() || command["colorScales"].size() > 16)
      throw std::runtime_error("RGBCount requires 1..16 RGB color ranges");
    std::vector<RgbRange> ranges;
    for (const auto& input : command["colorScales"]) {
      RgbRange range{};
      if (!input.is_array() || input.size() != 2)
        throw std::runtime_error("RGBCount range requires lower and upper RGB bounds");
      for (std::size_t bound = 0; bound < 2; ++bound) {
        if (!input[bound].is_array() || input[bound].size() != 3)
          throw std::runtime_error("RGBCount bounds require three RGB channels");
        for (std::size_t channel = 0; channel < 3; ++channel) {
          const auto& value = input[bound][channel];
          if (!value.is_number_integer() || value.get<std::int64_t>() < 0 ||
              value.get<std::int64_t>() > 255)
            throw std::runtime_error("RGBCount channel outside [0,255]");
          range[bound][channel] = value.get<int>();
        }
      }
      for (std::size_t channel = 0; channel < 3; ++channel)
        if (range[0][channel] > range[1][channel])
          throw std::runtime_error("RGBCount lower exceeds upper bound");
      ranges.push_back(range);
    }
    bool close = true;
    if (command.contains("colorWithClose")) {
      if (!command["colorWithClose"].is_boolean())
        throw std::runtime_error("colorWithClose must be boolean");
      close = command["colorWithClose"].get<bool>();
    }
    const auto name = template_path(command);
    const auto filename = root / "image" / from_utf8(name);
    const auto length = fs::file_size(filename);
    if (length == 0 || length > 16 * 1024 * 1024)
      throw std::runtime_error("RGBCount template file size is invalid");
    std::ifstream input(filename, std::ios::binary);
    std::vector<unsigned char> encoded(static_cast<std::size_t>(length));
    if (!input.read(reinterpret_cast<char*>(encoded.data()), static_cast<std::streamsize>(length)))
      throw std::runtime_error("cannot read RGBCount template");
    std::unique_ptr<MaaImageBuffer, decltype(api.MaaImageBufferDestroy)> templ(
        api.MaaImageBufferCreate(), api.MaaImageBufferDestroy);
    if (!templ || !api.MaaImageBufferSetEncoded(templ.get(), encoded.data(), encoded.size()))
      throw std::runtime_error("cannot decode RGBCount template");
    const int tw = api.MaaImageBufferWidth(templ.get()), th = api.MaaImageBufferHeight(templ.get());
    dimensions(tw, th);
    std::array<int, 4> roi{0, 0, api.MaaImageBufferWidth(image), api.MaaImageBufferHeight(image)};
    if (params.contains("roi")) roi = params["roi"].get<std::array<int, 4>>();
    const auto [left, top, w, h] = roi;
    if (tw > w || th > h) throw std::runtime_error("RGBCount template exceeds ROI");
    const auto template_mask = rgb_mask(templ.get(), {0, 0, tw, th}, ranges, close);
    const auto active = std::count(template_mask.begin(), template_mask.end(), 1);
    if (active == 0) throw std::runtime_error("RGBCount template has no active pixels");
    const auto image_mask = rgb_mask(image, roi, ranges, close);
    const auto pitch = static_cast<std::size_t>(w) + 1;
    std::vector<std::uint32_t> integral(pitch * (static_cast<std::size_t>(h) + 1));
    for (int y = 0; y < h; ++y) {
      std::uint32_t row = 0;
      for (int x = 0; x < w; ++x) {
        row += image_mask[static_cast<std::size_t>(y) * w + x];
        integral[(static_cast<std::size_t>(y) + 1) * pitch + x + 1] =
            integral[static_cast<std::size_t>(y) * pitch + x + 1] + row;
      }
    }
    const auto sum = [&](int x, int y, int rw, int rh) {
      return integral[static_cast<std::size_t>(y + rh) * pitch + x + rw] +
             integral[static_cast<std::size_t>(y) * pitch + x] -
             integral[static_cast<std::size_t>(y + rh) * pitch + x] -
             integral[static_cast<std::size_t>(y) * pitch + x + rw];
    };
    struct Run {
      int y, x, length;
    };
    std::vector<Run> runs;
    const bool full = active == static_cast<std::int64_t>(tw) * th;
    if (!full) {
      for (int y = 0; y < th; ++y)
        for (int x = 0; x < tw;) {
          if (!template_mask[static_cast<std::size_t>(y) * tw + x]) {
            ++x;
            continue;
          }
          const auto start = x;
          while (x < tw && template_mask[static_cast<std::size_t>(y) * tw + x]) ++x;
          runs.push_back({y, start, x - start});
        }
      const auto windows = static_cast<std::uint64_t>(w - tw + 1) * (h - th + 1);
      if (windows * runs.size() > 64 * 1024 * 1024)
        throw std::runtime_error("RGBCount sparse template exceeds bounded matching work");
    }
    const auto nms =
        command.contains("nmsDistance") ? integer(command, "nmsDistance", 0, max_dimension) : 0;
    const auto distance = nms > 0 ? nms : (std::min)(tw, th) / 2;
    const double threshold = params.value("threshold", 0.8);
    struct Match {
      int x, y;
      float score;
    };
    std::vector<Match> matches;
    for (int y = 0; y <= h - th; ++y) {
      if (cancelled) throw std::runtime_error("cancelled RGBCount recognition");
      for (int x = 0; x <= w - tw; ++x) {
        const auto total = sum(x, y, tw, th);
        std::uint32_t tp = full ? total : 0;
        if (!full)
          for (const auto& run : runs) tp += sum(x + run.x, y + run.y, run.length, 1);
        const auto score = static_cast<float>(2 * tp) / static_cast<float>(total + active);
        if (score < threshold) continue;
        bool push = true;
        for (auto previous = matches.rbegin(); previous != matches.rend(); ++previous) {
          if (std::abs(x - previous->x) >= distance || std::abs(y - previous->y) >= distance)
            continue;
          if (previous->score < score) *previous = {x, y, score};
          push = false;
          break;
        }
        if (push) {
          if (matches.size() >= 256)
            throw std::runtime_error("RGBCount results exceed 256 matches");
          matches.push_back({x, y, score});
        }
      }
    }
    Json result = Json::array();
    for (const auto& match : matches)
      result.push_back({{"box", {match.x + left, match.y + top, tw, th}}, {"score", match.score}});
    return {{"hit", !result.empty()}, {"matches", std::move(result)}, {"engine", "maafw"}};
  }

  Json recognition(MaaImageBuffer* image, const char* kind, const Json& params) {
    const auto text = params.dump();
    MaaRecoId reco = MaaInvalidId;
    if (current_context) {
      if (cancelled) throw std::runtime_error("cancelled before custom context recognition");
      reco = api.MaaContextRunRecognitionDirect(current_context, kind, text.c_str(), image);
      if (reco == MaaInvalidId) throw std::runtime_error("custom context recognition rejected");
    } else {
      MaaTaskId id;
      {
        std::lock_guard guard(lifecycle);
        if (cancelled) throw std::runtime_error("cancelled before MaaFramework recognition");
        id = api.MaaTaskerPostRecognition(tasker, kind, text.c_str(), image);
      }
      await(id, [&](auto item) { return api.MaaTaskerStatus(tasker, item); }, "recognition", true);
      if (cancelled) throw std::runtime_error("cancelled recognition");
      MaaSize count = 0;
      if (!api.MaaTaskerGetTaskDetail(tasker, id, nullptr, nullptr, &count, nullptr) ||
          count == 0 || count > 1024)
        throw std::runtime_error("MaaFramework recognition returned no node detail");
      std::vector<MaaNodeId> nodes(count);
      if (!api.MaaTaskerGetTaskDetail(tasker, id, nullptr, nodes.data(), &count, nullptr))
        throw std::runtime_error("cannot read MaaFramework task detail");
      if (!api.MaaTaskerGetNodeDetail(tasker, nodes.back(), nullptr, &reco, nullptr, nullptr))
        throw std::runtime_error("cannot read MaaFramework node detail");
    }
    if (cancelled) throw std::runtime_error("cancelled recognition");
    std::unique_ptr<MaaStringBuffer, decltype(api.MaaStringBufferDestroy)> detail(
        api.MaaStringBufferCreate(), api.MaaStringBufferDestroy);
    MaaBool hit = false;
    if (!detail || !api.MaaTaskerGetRecognitionDetail(tasker, reco, nullptr, nullptr, &hit, nullptr,
                                                      detail.get(), nullptr, nullptr))
      throw std::runtime_error("cannot read MaaFramework recognition detail");
    const char* raw = api.MaaStringBufferGet(detail.get());
    const auto data = Json::parse(raw ? raw : "{}", nullptr, false);
    if (!data.is_object()) throw std::runtime_error("invalid MaaFramework recognition detail");
    Json matches = Json::array();
    if (data.contains("filtered") && data["filtered"].is_array()) {
      if (data["filtered"].size() > 256)
        throw std::runtime_error("MaaFramework recognition returned too many matches");
      for (const auto& item : data["filtered"]) {
        if (!item.is_object() || !item.contains("box") || !item["box"].is_array() ||
            item["box"].size() != 4)
          throw std::runtime_error("invalid MaaFramework match detail");
        const bool color = std::string_view(kind) == "ColorMatch";
        const auto area =
            params.contains("roi")
                ? params["roi"][2].get<std::int64_t>() * params["roi"][3].get<std::int64_t>()
                : static_cast<std::int64_t>(api.MaaImageBufferWidth(image)) *
                      api.MaaImageBufferHeight(image);
        double score = 0;
        std::int64_t count = 0;
        if (color) {
          if (!item.contains("count") || !item["count"].is_number_integer())
            throw std::runtime_error("invalid MaaFramework color pixel count");
          count = item["count"].get<std::int64_t>();
          if (count < 0 || count > area || area <= 0)
            throw std::runtime_error("MaaFramework color pixel count outside image");
          score = double(count) / double(area);
        } else {
          if (!item.contains("score") || !item["score"].is_number())
            throw std::runtime_error("invalid MaaFramework match score");
          score = item["score"].get<double>();
        }
        if (!std::isfinite(score) || score < 0 || score > 1)
          throw std::runtime_error("invalid MaaFramework match score");
        for (const auto& coordinate : item["box"])
          if (!coordinate.is_number_integer() || coordinate.get<std::int64_t>() < 0 ||
              coordinate.get<std::int64_t>() > max_dimension)
            throw std::runtime_error("invalid MaaFramework match box");
        Json match{{"box", item["box"]}, {"score", score}};
        if (color) match["count"] = count;
        if (item.contains("text") && item["text"].is_string()) match["text"] = item["text"];
        matches.push_back(std::move(match));
      }
    }
    {
      std::lock_guard guard(lifecycle);
      if (!cancelled && !current_context) api.MaaTaskerClearCache(tasker);
    }
    return {{"hit", bool(hit)}, {"matches", std::move(matches)}, {"engine", "maafw"}};
  }

  /** 只遍历已支持 v1 字段中的节点引用；图片路径、OCR 文本与 Custom 参数保持字面值。 */
  static void node_references(Json& node, const std::function<void(Json&)>& visit) {
    for (const auto* field : {"next", "on_error"})
      if (node.contains(field))
        for (auto& target : node[field]) visit(target);
    for (const auto* field : {"roi", "target", "begin", "color_filter"})
      if (node.contains(field) && node[field].is_string() &&
          (std::strcmp(field, "color_filter") != 0 || !node[field].get_ref<std::string&>().empty()))
        visit(node[field]);
    if (node.contains("end")) {
      auto& end = node["end"];
      if (end.is_string())
        visit(end);
      else if (end.is_array())
        for (auto& target : end)
          if (target.is_string()) visit(target);
    }
    for (const auto* field : {"pre_wait_freezes", "post_wait_freezes", "repeat_wait_freezes"})
      if (node.contains(field) && node[field].is_object() && node[field].contains("target") &&
          node[field]["target"].is_string())
        visit(node[field]["target"]);
  }

  void validate_pipeline(const Json& command) {
    const auto entry = required_string(command, "entry");
    const auto valid_name = [](const std::string& name) {
      // Schema limits Unicode characters; UTF-8 resource node names commonly
      // contain Chinese text, so do not confuse byte length with that limit.
      const auto characters = std::count_if(name.begin(), name.end(),
                                            [](unsigned char ch) { return (ch & 0xc0) != 0x80; });
      return !name.empty() && characters <= 128 &&
             std::none_of(name.begin(), name.end(),
                          [](unsigned char ch) { return ch < 32 || ch == '[' || ch == ']'; });
    };
    if (!valid_name(entry) || !command.contains("pipeline") || !command["pipeline"].is_object())
      throw std::runtime_error("invalid pipeline entry or nodes");
    const auto& nodes = command["pipeline"];
    if (nodes.empty() || nodes.size() > 256 || !nodes.contains(entry))
      throw std::runtime_error("pipeline must contain its entry and 1 to 256 nodes");
    const auto text = nodes.dump();
    if (text.size() > 512 * 1024) throw std::runtime_error("pipeline exceeds 512 KiB");
    static const std::set<std::string> actions{"DoNothing", "Click", "Swipe", "ClickKey", "Custom"};
    static const std::set<std::string> recognitions{"DirectHit", "OCR", "TemplateMatch",
                                                    "ColorMatch"};
    for (const auto& [name, node] : nodes.items()) {
      if (!valid_name(name) || !node.is_object() || node.size() > 64)
        throw std::runtime_error("invalid pipeline node");
      if (!node.value("action", Json("DoNothing")).is_string() ||
          !actions.contains(node.value("action", Json("DoNothing")).get<std::string>()) ||
          !node.value("recognition", Json("DirectHit")).is_string() ||
          !recognitions.contains(node.value("recognition", Json("DirectHit")).get<std::string>()))
        throw std::runtime_error("unsupported pipeline action or recognition");
      if (node.value("action", Json("DoNothing")) == "Custom" &&
          (node.value("custom_action", Json()) != "MaaVerge.Custom" ||
           !node.contains("custom_action_param") || !node["custom_action_param"].is_object() ||
           node["custom_action_param"].size() > 64))
        throw std::runtime_error("pipeline custom action must use MaaVerge.Custom");
      for (const auto* field : {"timeout", "pre_delay", "post_delay"})
        if (node.contains(field)) integer(node, field, 0, 120000);
      if (node.contains("key") && node["key"] != 4 && node["key"] != 111)
        throw std::runtime_error("pipeline key must be back or escape");
      if (node.contains("template")) {
        auto templates = node["template"];
        if (templates.is_string()) templates = Json::array({templates});
        if (!templates.is_array() || templates.empty() || templates.size() > 32)
          throw std::runtime_error("invalid pipeline templates");
        for (const auto& image : templates) {
          if (!image.is_string()) throw std::runtime_error("invalid pipeline template path");
          template_path({{"template", image}});
        }
      }
      for (const auto* field : {"next", "on_error"}) {
        if (!node.contains(field)) continue;
        const auto& targets = node[field];
        if (!targets.is_array() || targets.size() > 256)
          throw std::runtime_error("pipeline edges must be bounded node lists");
        for (const auto& target : targets)
          if (!target.is_string() || !nodes.contains(target.get<std::string>()))
            throw std::runtime_error("pipeline edge must name an explicit node");
      }
      // 锚点属于官方共享 TaskState，当前有限协议不开放跨调用锚点或节点属性语法。
      if (node.contains("anchor")) throw std::runtime_error("pipeline anchors are not supported");
      auto references = node;
      node_references(references, [&](Json& target) {
        if (!target.is_string() || !nodes.contains(target.get<std::string>()))
          throw std::runtime_error("pipeline reference must name an explicit node");
      });
    }
  }

  /** 官方 Context 克隆共享 hit_count；为每次子调用隔离节点名，保留父层和单图内计数。 */
  void namespace_pipeline(PipelineCall& call, bool nested) {
    Json names = Json::object();
    if (nested) {
      // 内部名只依赖进程内序号，并检查祖先图，不能与已加载父节点发生名称碰撞。
      bool collision;
      do {
        names = Json::object();
        collision = false;
        const auto prefix = "MaaVerge.Context." + std::to_string(++pipeline_sequence) + ".";
        std::size_t index = 0;
        for (const auto& [name, node] : call.nodes.items()) {
          const auto native = prefix + std::to_string(index++);
          names[name] = native;
          for (const auto& parent : pipeline_calls)
            if (parent->native_nodes.contains(native)) collision = true;
        }
      } while (collision);
    } else {
      for (const auto& [name, node] : call.nodes.items()) names[name] = name;
    }
    call.native_nodes = Json::object();
    call.original_names = Json::object();
    for (const auto& [name, source] : call.nodes.items()) {
      auto node = source;
      node_references(node, [&](Json& target) { target = names.at(target.get<std::string>()); });
      const auto native = names.at(name).get<std::string>();
      call.original_names[native] = name;
      call.native_nodes[native] = std::move(node);
    }
  }

  /** 检查实际任务状态及末节点证据；ContextRunTask 即使失败也可能返回有效 id。 */
  void validate_task(MaaTaskId id) {
    MaaSize count = 0;
    MaaStatus status = MaaStatus_Invalid;
    if (id == MaaInvalidId || cancelled ||
        !api.MaaTaskerGetTaskDetail(tasker, id, nullptr, nullptr, &count, &status) ||
        status != MaaStatus_Succeeded || count == 0 || count > 4096)
      throw std::runtime_error("pipeline task failed or returned no bounded node evidence");
    std::vector<MaaNodeId> executed(count);
    if (!api.MaaTaskerGetTaskDetail(tasker, id, nullptr, executed.data(), &count, &status))
      throw std::runtime_error("cannot read pipeline task detail");
    MaaBool completed = false;
    if (!api.MaaTaskerGetNodeDetail(tasker, executed.back(), nullptr, nullptr, nullptr,
                                    &completed) ||
        !completed)
      throw std::runtime_error("pipeline final node was not completed");
  }

  Json pipeline(const Json& command) {
    validate_pipeline(command);
    const auto entry = required_string(command, "entry");
    const bool nested = command.value("operation", std::string()) == "context_pipeline";
    std::shared_ptr<PipelineCall> call;
    {
      std::lock_guard guard(custom_mutex);
      if (cancelled) throw std::runtime_error("cancelled before pipeline");
      if (nested &&
          (!current_context || custom_calls.empty() || !custom_calls.back()->child_pending))
        throw std::runtime_error("context pipeline requires active parent callback");
      const auto depth = pipeline_calls.size() + 1;
      if (depth > 8) throw std::runtime_error("context pipeline depth exceeds 8");
      const auto id = command.value("contextId", std::string("root"));
      if (id.empty() || id.size() > 128 ||
          std::any_of(pipeline_calls.begin(), pipeline_calls.end(),
                      [&](const auto& parent) { return parent->id == id; }))
        throw std::runtime_error("invalid or duplicate pipeline context identity");
      call = std::make_shared<PipelineCall>(
          PipelineCall{id,
                       nested ? custom_calls.back()->id : std::string(),
                       command["pipeline"],
                       {},
                       {},
                       depth});
      namespace_pipeline(*call, nested);
      if (!nested)
        root_expires = std::chrono::steady_clock::now() + std::chrono::milliseconds(120000);
      pipeline_calls.push_back(call);
    }
    const auto clear = [&] {
      std::lock_guard guard(custom_mutex);
      if (!pipeline_calls.empty() && pipeline_calls.back() == call) pipeline_calls.pop_back();
    };
    try {
      const auto text = call->native_nodes.dump();
      auto native_entry = entry;
      for (const auto& [native, original] : call->original_names.items())
        if (original == entry) native_entry = native;
      MaaTaskId id;
      if (nested) {
        // 同步使用当前 Context；禁止向已被父流程占用的 Tasker 再排队。
        id = api.MaaContextRunTask(current_context, native_entry.c_str(), text.c_str());
      } else {
        {
          std::lock_guard guard(lifecycle);
          if (cancelled) throw std::runtime_error("cancelled before pipeline");
          id = api.MaaTaskerPostTask(tasker, entry.c_str(), text.c_str());
        }
        await(
            id, [&](auto item) { return api.MaaTaskerStatus(tasker, item); }, "pipeline", false,
            120000);
      }
      validate_task(id);
      clear();
      if (!nested) {
        std::lock_guard guard(lifecycle);
        if (cancelled) throw std::runtime_error("cancelled pipeline");
        api.MaaTaskerClearCache(tasker);
      }
      if (!nested) emit_epoch();
      return accepted();
    } catch (...) {
      clear();
      if (!nested) {
        cleanup_touch();
        emit_epoch();
      }
      throw;
    }
  }

  Json recognize(const Json& command) {
    if (!command.contains("image") || !command["image"].is_object())
      throw std::runtime_error("recognition requires a PNG image");
    const auto& input = command["image"];
    const int w = integer(input, "width", 1, max_dimension);
    const int h = integer(input, "height", 1, max_dimension);
    dimensions(w, h);
    auto bytes = decode(required_string(input, "data"));
    png_header(bytes, w, h);
    std::unique_ptr<MaaImageBuffer, decltype(api.MaaImageBufferDestroy)> image(
        api.MaaImageBufferCreate(), api.MaaImageBufferDestroy);
    if (!image || !api.MaaImageBufferSetEncoded(image.get(), bytes.data(), bytes.size()) ||
        api.MaaImageBufferWidth(image.get()) != w || api.MaaImageBufferHeight(image.get()) != h)
      throw std::runtime_error("cannot decode PNG image with matching dimensions");
    int coordinate_width = w, coordinate_height = h;
    if (command.contains("referenceSize")) {
      const auto& reference = command["referenceSize"];
      if (!reference.is_array() || reference.size() != 2 || !reference[0].is_number_integer() ||
          !reference[1].is_number_integer() || reference[0] < 1 || reference[0] > 8192 ||
          reference[1] < 1 || reference[1] > 8192)
        throw std::runtime_error("recognition referenceSize requires two integers in [1,8192]");
      coordinate_width = reference[0].get<int>();
      coordinate_height = reference[1].get<int>();
      // 通用画布只允许等比例缩放；像素总量继续受统一内存门禁约束，不依赖游戏分辨率。
      dimensions(coordinate_width, coordinate_height);
      if (static_cast<std::int64_t>(w) * coordinate_height !=
          static_cast<std::int64_t>(h) * coordinate_width)
        throw std::runtime_error(
            "referenceSize must preserve the source frame aspect ratio; cropping is unsupported");
      if (!api.MaaImageBufferResize(image.get(), coordinate_width, coordinate_height))
        throw std::runtime_error("cannot resize recognition image to referenceSize");
    }
    Json params = Json::object();
    if (command.contains("roi")) {
      const auto& roi = command["roi"];
      if (!roi.is_array() || roi.size() != 4)
        throw std::runtime_error("ROI must have four integer coordinates");
      for (const auto& coordinate : roi)
        if (!coordinate.is_number_integer()) throw std::runtime_error("ROI must be integral");
      const auto x = roi[0].get<std::int64_t>(), y = roi[1].get<std::int64_t>();
      const auto rw = roi[2].get<std::int64_t>(), rh = roi[3].get<std::int64_t>();
      if (x < 0 || y < 0 || rw <= 0 || rh <= 0 || rw > coordinate_width || rh > coordinate_height ||
          x > coordinate_width - rw || y > coordinate_height - rh)
        throw std::runtime_error("ROI outside recognition image");
      params["roi"] = roi;
    }
    const auto kind = required_string(command, "kind");
    const bool rgb =
        kind == "template" && command.contains("method") && command["method"] == "RGBCount";
    if (!rgb && (command.contains("pureColor") || command.contains("colorScales") ||
                 command.contains("colorWithClose") || command.contains("nmsDistance")))
      throw std::runtime_error("RGBCount parameters require template method RGBCount");
    if (kind != "ocr" && (command.contains("onlyRec") || command.contains("replace")))
      throw std::runtime_error("OCR parameters require OCR recognition");
    if (kind != "template" && (command.contains("template") || command.contains("maskRange") ||
                               command.contains("greenMask")))
      throw std::runtime_error("template parameters require template recognition");
    if (kind != "color" && (command.contains("lower") || command.contains("upper") ||
                            command.contains("count") || command.contains("connected")))
      throw std::runtime_error("color parameters require color recognition");
    if (kind == "ocr" && command.contains("method"))
      throw std::runtime_error("OCR does not accept a matching method");
    if (command.contains("threshold")) {
      if (!command["threshold"].is_number()) throw std::runtime_error("invalid threshold");
      const auto threshold = command["threshold"].get<double>();
      if (!std::isfinite(threshold) || threshold < 0 || threshold > 1)
        throw std::runtime_error("threshold outside [0,1]");
      params["threshold"] = threshold;
    }
    const char* recognition_kind = nullptr;
    if (kind == "ocr") {
      recognition_kind = "OCR";
      if (command.contains("onlyRec")) {
        if (!command["onlyRec"].is_boolean()) throw std::runtime_error("onlyRec must be boolean");
        if (command["onlyRec"].get<bool>() && !command.contains("roi"))
          throw std::runtime_error("onlyRec requires an explicit ROI");
        params["only_rec"] = command["onlyRec"];
      }
      if (command.contains("replace")) {
        const auto& replacements = command["replace"];
        if (!replacements.is_array() || replacements.size() > 256)
          throw std::runtime_error("invalid OCR replacements");
        for (const auto& pair : replacements) {
          if (!pair.is_array() || pair.size() != 2)
            throw std::runtime_error("OCR replacement must be a string pair");
          for (const auto& part : pair)
            if (!part.is_string() || part.get_ref<const std::string&>().size() > 2048)
              throw std::runtime_error("invalid OCR replacement text");
        }
        params["replace"] = replacements;
      }
    } else if (kind == "template") {
      if (rgb) {
        auto result = rgb_count(image.get(), command, params);
        if (command.contains("referenceSize"))
          result["coordinateSize"] = {coordinate_width, coordinate_height};
        return result;
      }
      recognition_kind = "TemplateMatch";
      params["template"] = template_path(command);
      if (command.contains("method")) params["method"] = integer(command, "method", 5, 5);
      if (command.contains("greenMask")) {
        if (!command["greenMask"].is_boolean())
          throw std::runtime_error("greenMask must be boolean");
        params["green_mask"] = command["greenMask"];
      }
      if (command.contains("maskRange")) {
        if (command.contains("greenMask"))
          throw std::runtime_error("maskRange and greenMask cannot be combined");
        params["template"] = masked_template(command);
        params["green_mask"] = true;
      }
    } else if (kind == "color") {
      recognition_kind = "ColorMatch";
      if (command.contains("threshold")) throw std::runtime_error("color uses count threshold");
      params["method"] = integer(command, "method", 40, 40);
      for (const auto* bound : {"lower", "upper"}) {
        if (!command.contains(bound) || !command[bound].is_array() || command[bound].size() != 3)
          throw std::runtime_error("HSV bounds must each have three channels");
        for (std::size_t index = 0; index < 3; ++index) {
          const auto& channel = command[bound][index];
          if (!channel.is_number_integer() || channel.get<std::int64_t>() < 0 ||
              channel.get<std::int64_t>() > (index == 0 ? 179 : 255))
            throw std::runtime_error("HSV color bound out of range");
        }
        params[bound] = command[bound];
      }
      for (std::size_t index = 0; index < 3; ++index)
        if (params["lower"][index] > params["upper"][index])
          throw std::runtime_error("HSV lower exceeds upper bound");
      if (command.contains("count")) params["count"] = integer(command, "count", 1, max_pixels);
      if (command.contains("connected")) {
        if (!command["connected"].is_boolean())
          throw std::runtime_error("connected must be boolean");
        params["connected"] = command["connected"];
      }
    } else {
      throw std::runtime_error("unsupported recognition kind");
    }
    auto result = recognition(image.get(), recognition_kind, params);
    if (command.contains("referenceSize"))
      result["coordinateSize"] = {coordinate_width, coordinate_height};
    return result;
  }

  Json validation() {
    if (control) throw std::runtime_error("framework validation requires recognition mode");
    Json result{{"engine", "maafw"},
                {"version", version},
                {"resourceLoaded", true},
                {"ocrAvailable", false}};
    for (const auto* name : {"det.onnx", "rec.onnx", "keys.txt"}) {
      if (!fs::is_regular_file(root / "model" / "ocr" / name)) {
        result["diagnostic"] =
            "OCR model set is unavailable; template recognition remains available";
        return result;
      }
    }
    try {
      // A deterministic local glyph probe loads the actual recognizer. OpenCV
      // CV_8UC3 is 16; MaaFW's public raw-image API uses OpenCV image type codes.
      constexpr int w = 320, h = 96, type_bgr8 = 16;
      std::vector<unsigned char> pixels(w * h * 3, 255);
      const std::array<std::array<const char*, 7>, 3> glyphs{{
          {{"10001", "11011", "10101", "10101", "10001", "10001", "10001"}},
          {{"01110", "10001", "10001", "11111", "10001", "10001", "10001"}},
          {{"01110", "10001", "10001", "11111", "10001", "10001", "10001"}},
      }};
      for (int letter = 0; letter < 3; ++letter)
        for (int row = 0; row < 7; ++row)
          for (int column = 0; column < 5; ++column)
            if (glyphs[letter][row][column] == '1')
              for (int dy = 0; dy < 8; ++dy)
                for (int dx = 0; dx < 8; ++dx) {
                  const int offset =
                      ((20 + row * 8 + dy) * w + 70 + letter * 56 + column * 8 + dx) * 3;
                  std::fill_n(pixels.begin() + offset, 3, 0);
                }
      std::unique_ptr<MaaImageBuffer, decltype(api.MaaImageBufferDestroy)> image(
          api.MaaImageBufferCreate(), api.MaaImageBufferDestroy);
      if (!image || !api.MaaImageBufferSetRawData(image.get(), pixels.data(), w, h, type_bgr8))
        throw std::runtime_error("cannot create offline OCR probe image");
      const auto probe = recognition(image.get(), "OCR", {{"threshold", 0.0}});
      result["ocrAvailable"] = probe.value("hit", false) && !probe["matches"].empty();
      if (!result["ocrAvailable"].get<bool>())
        result["diagnostic"] = "offline OCR probe returned no text";
    } catch (const std::exception& error) {
      result["diagnostic"] = std::string("offline OCR probe failed: ") + error.what();
    }
    return result;
  }

  Json config;
  fs::path sdk;
  fs::path root;
  FrameworkApi api;
  MaaResource* resource = nullptr;
  std::set<std::string> masked_templates;
  MaaTasker* tasker = nullptr;
  MaaController* controller = nullptr;
  bool control = false;
  bool touch_available = false;
  std::atomic<bool> cancelled = false;
  std::mutex lifecycle;
  bool stop_posted = false;
  MaaTaskId stop_id = MaaInvalidId;
  int timeout;
  int call_timeout = 90000;
  int shutdown_timeout = 5000;
  int width = 0;
  int height = 0;
  std::string version;
  inline static thread_local MaaContext* current_context = nullptr;
  std::mutex custom_mutex;
  std::condition_variable custom_condition;
  // 根期限不会被每层子调用续期；栈与输入代际属于同一控制进程。
  std::vector<std::shared_ptr<CustomCall>> custom_calls;
  std::vector<std::shared_ptr<PipelineCall>> pipeline_calls;
  std::chrono::steady_clock::time_point root_expires;
  std::atomic<std::uint64_t> input_epoch = 0;
  MaaSinkId context_sink = MaaInvalidId;
  std::uint64_t custom_sequence = 0;
  std::uint64_t pipeline_sequence = 0;
  std::function<void(Json)> sender;
  std::function<Json(const Json&)> execute;
};

Framework::Framework(const Json& config) : impl_(std::make_unique<Impl>(config)) {
  impl_->execute = [this](const Json& command) { return this->command(command); };
}
Framework::~Framework() = default;
const std::string& Framework::version() const { return impl_->version; }
Json Framework::validation() { return impl_->validation(); }
void Framework::set_sender(std::function<void(Json)> sender) { impl_->sender = std::move(sender); }
void Framework::dispatch_custom(const Json& command) { impl_->dispatch_custom(command); }
void Framework::prepare() {
  // Failure cleanup can have requested a stop after the action finished. Drain
  // that stop before starting another command or forgetting its shared id.
  bool posted;
  MaaTaskId previous_stop;
  {
    std::lock_guard guard(impl_->lifecycle);
    posted = impl_->stop_posted;
    previous_stop = impl_->stop_id;
  }
  if (posted) {
    Deadline deadline("finish prior stop", impl_->call_timeout, [this] { impl_->cleanup_touch(); });
    impl_->await(
        previous_stop, [&](auto id) { return impl_->api.MaaTaskerStatus(impl_->tasker, id); },
        "finish prior stop");
    while (impl_->api.MaaTaskerRunning(impl_->tasker))
      std::this_thread::sleep_for(std::chrono::milliseconds(5));
  }
  std::lock_guard guard(impl_->lifecycle);
  impl_->cancelled = false;
  impl_->stop_posted = false;
  impl_->stop_id = MaaInvalidId;
}

Json Framework::stop() {
  Deadline deadline("stop MaaFramework", impl_->call_timeout, [this] { impl_->cleanup_touch(); });
  const auto id = impl_->request_stop();
  impl_->await(
      id, [&](auto item) { return impl_->api.MaaTaskerStatus(impl_->tasker, item); }, "stop");
  if (impl_->controller && impl_->touch_available &&
      impl_->api.MaaControllerConnected(impl_->controller)) {
    impl_->await(
        impl_->api.MaaControllerPostTouchUp(impl_->controller, 0),
        [&](auto item) { return impl_->api.MaaControllerStatus(impl_->controller, item); },
        "release touch");
  }
  return accepted();
}

Json Framework::command(const Json& command) {
  check_protocol(command);
  const auto operation = required_string(command, "operation");
  const auto remaining = operation == "context_pipeline"
                             ? std::chrono::duration_cast<std::chrono::milliseconds>(
                                   impl_->root_expires - std::chrono::steady_clock::now())
                                   .count()
                             : 120000;
  if (operation == "context_pipeline" && remaining <= 0)
    throw std::runtime_error("root pipeline deadline expired");
  Deadline deadline("MaaFramework command",
                    operation == "pipeline"           ? 120000
                    : operation == "context_pipeline" ? static_cast<int>(remaining)
                                                      : impl_->call_timeout,
                    [this] { impl_->cleanup_touch(); });
  if (operation == "recognize") return impl_->recognize(command);
  if (operation == "stop") return stop();
  impl_->require_control(operation != "connect");
  if (operation == "connect") {
    impl_->touch_available = false;
    impl_->await(
        impl_->api.MaaControllerPostConnection(impl_->controller),
        [&](auto id) { return impl_->api.MaaControllerStatus(impl_->controller, id); },
        "connect MaaFramework controller");
    if (!impl_->api.MaaControllerConnected(impl_->controller))
      throw std::runtime_error("MaaFramework connection failed (no fallback)");
    // v5.14.3 exposes feature flags only through internal C++ interfaces. A
    // successful public TouchUp confirms the required touch path without
    // pressing a contact or substituting a different input backend.
    impl_->touch_available =
        impl_->await(
            impl_->api.MaaControllerPostTouchUp(impl_->controller, 0),
            [&](auto id) { return impl_->api.MaaControllerStatus(impl_->controller, id); },
            "confirm selected input touch capability", true) == MaaStatus_Succeeded;
    return accepted();
  }
  if (operation == "start_app" || operation == "stop_app") {
    // 只允许明确 Android 包／组件标识，不能将命令、参数或 shell 片段传给 SDK。
    const auto app = required_string(command, "appId");
    static const std::regex package_pattern(R"(^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)+$)");
    static const std::regex activity_pattern(
        R"(^(\.[A-Za-z_$][A-Za-z0-9_.$]*|[A-Za-z_$][A-Za-z0-9_$]*(\.[A-Za-z_$][A-Za-z0-9_$]*)+)$)");
    if (app.size() > 200 || !std::regex_match(app, package_pattern))
      throw std::runtime_error("appId must be an Android package identifier");
    std::string target = app;
    if (command.contains("intent")) {
      if (operation != "start_app") throw std::runtime_error("stop_app forbids intent");
      target = required_string(command, "intent");
      const auto prefix = app + "/";
      if (target.size() > 400 || !target.starts_with(prefix) ||
          !std::regex_match(target.substr(prefix.size()), activity_pattern))
        throw std::runtime_error("intent must be an explicit component of appId");
    }

    // 生命周期操作没有坐标前提；提交前废弃旧帧并推进代际，回执只证明 SDK 操作完成。
    MaaCtrlId id;
    {
      std::lock_guard guard(impl_->lifecycle);
      if (impl_->cancelled) throw std::runtime_error("cancelled before app lifecycle operation");
      impl_->width = impl_->height = 0;
      ++impl_->input_epoch;
      impl_->emit_epoch();
      id = operation == "start_app"
               ? impl_->api.MaaControllerPostStartApp(impl_->controller, target.c_str())
               : impl_->api.MaaControllerPostStopApp(impl_->controller, target.c_str());
    }
    impl_->await(
        id, [&](auto item) { return impl_->api.MaaControllerStatus(impl_->controller, item); },
        operation.c_str());
    if (impl_->cancelled) throw std::runtime_error("cancelled app lifecycle operation");
    return accepted();
  }
  if (operation == "frame") return impl_->frame();
  if (operation == "pipeline" || operation == "context_pipeline") return impl_->pipeline(command);
  if (operation == "click") {
    const auto x = integer(command, "x", 0, max_dimension);
    const auto y = integer(command, "y", 0, max_dimension);
    impl_->point(x, y);
    return impl_->action("Click", {{"target", {x, y}}});
  }
  if (operation == "long_press") {
    const auto x = integer(command, "x", 0, max_dimension);
    const auto y = integer(command, "y", 0, max_dimension);
    const auto duration = integer(command, "durationMs", 1, 10000);
    impl_->point(x, y);
    if (!impl_->touch_available)
      throw std::runtime_error("long press unavailable: selected input touch capability failed");
    // The pinned official LongPress action owns the complete down/hold/up cycle.
    return impl_->action("LongPress", {{"target", {x, y}}, {"duration", duration}});
  }
  if (operation == "drag") {
    const auto x1 = integer(command, "x1", 0, max_dimension);
    const auto y1 = integer(command, "y1", 0, max_dimension);
    const auto x2 = integer(command, "x2", 0, max_dimension);
    const auto y2 = integer(command, "y2", 0, max_dimension);
    const auto duration = integer(command, "durationMs", 1, 10000);
    impl_->point(x1, y1);
    impl_->point(x2, y2);
    if (!impl_->touch_available)
      throw std::runtime_error("drag unavailable: selected input touch capability failed");
    // One held segment completes before release, without navigation compensation.
    return impl_->action(
        "Swipe",
        {{"begin", {x1, y1}}, {"end", {{x2, y2}}}, {"duration", {duration}}, {"end_hold", {0}}});
  }
  if (operation == "press_key") {
    const auto key = required_string(command, "key");
    if (key != "back" && key != "escape") throw std::runtime_error("unsupported key");
    return impl_->action("ClickKey", {{"key", key == "back" ? 4 : 111}});
  }
  if (operation == "swipe") {
    const auto x1 = integer(command, "x1", 0, max_dimension);
    const auto y1 = integer(command, "y1", 0, max_dimension);
    const auto x2 = integer(command, "x2", 0, max_dimension);
    const auto y2 = integer(command, "y2", 0, max_dimension);
    impl_->point(x1, y1);
    impl_->point(x2, y2);
    const auto duration = command.contains("durationMs") ? integer(command, "durationMs", 1, 10000)
                                                         : navigation_profile.duration_ms;
    const auto profile = command.value("profile", std::string("drag"));
    const auto direction = command.value("compensationDirection", std::string("none"));
    if (profile != "drag" && profile != "navigation")
      throw std::runtime_error("invalid swipe profile");
    if (direction != "none" && direction != "up" && direction != "down" && direction != "left" &&
        direction != "right")
      throw std::runtime_error("invalid compensation direction");
    Json params{
        {"begin", {x1, y1}}, {"end", {{x2, y2}}}, {"duration", {duration}}, {"end_hold", {0}}};
    if (profile == "navigation") {
      if (!impl_->touch_available)
        throw std::runtime_error(
            "navigation unavailable: selected input touch capability failed (no backend fallback)");
      params["end_hold"][0] = navigation_profile.end_hold_ms;
      if (direction != "none") {
        const int distance = std::max(
            1, static_cast<int>(std::lround(double(navigation_profile.compensation_distance) *
                                            impl_->height / navigation_profile.reference_height)));
        const int dx = direction == "left" ? -distance : direction == "right" ? distance : 0;
        const int dy = direction == "up" ? -distance : direction == "down" ? distance : 0;
        const int end_x = std::clamp(x2 + dx, 0, impl_->width - 1);
        const int end_y = std::clamp(y2 + dy, 0, impl_->height - 1);
        params["end"].push_back({end_x, end_y});
        params["duration"].push_back(navigation_profile.compensation_duration_ms);
        params["end_hold"].push_back(0);
      }
    } else if (direction != "none") {
      throw std::runtime_error("drag profile forbids navigation compensation");
    }
    return impl_->action("Swipe", params);
  }
  throw std::runtime_error("unknown framework operation: " + operation);
}

int framework_main(const Json& config, Protocol& protocol, bool validation) {
  const auto mode = required_string(config, "mode");
  if (validation && mode != "recognition")
    throw std::runtime_error("framework validation requires recognition mode");
  std::unique_ptr<DeviceLease> lease;
  if (mode == "control")
    lease = std::make_unique<DeviceLease>(absolute_path(required_string(config, "lockPath")),
                                          duration_ms(config, "lockTimeoutMs", 10000, 60000));
  std::unique_ptr<Framework> framework;
  {
    const int startup = duration_ms(config, "startupTimeoutMs", 90000);
    if (startup == 0) throw std::runtime_error("startupTimeoutMs must be positive");
    Deadline deadline("load MaaFramework", startup);
    framework = std::make_unique<Framework>(config);
  }
  if (validation) {
    protocol.send(framework->validation());
    return 0;
  }
  framework->set_sender([&protocol](Json message) { protocol.send(std::move(message)); });
  protocol.send(
      {{"type", "ready"}, {"engine", "maafw"}, {"mode", mode}, {"version", framework->version()}});
  std::atomic<bool> busy = false;
  std::thread active;
  auto respond = [&](const Json& command, const std::function<Json()>& operation) {
    try {
      protocol.send({{"type", "response"}, {"id", command["id"]}, {"result", operation()}});
    } catch (const std::exception& error) {
      protocol.send({{"type", "response"},
                     {"id", command.value("id", Json(nullptr))},
                     {"error", error.what()}});
    }
  };
  try {
    std::string line;
    while (read_message(line)) {
      Json command = Json::object();
      try {
        command = Json::parse(line);
        if (!command.is_object() || !command.contains("id") ||
            (!command["id"].is_string() && !command["id"].is_number_integer()))
          throw std::runtime_error("command id must be a string or integer");
        check_protocol(command);
        const auto operation = required_string(command, "operation");
        if (command.contains("callbackId") || operation == "custom_result") {
          framework->dispatch_custom(command);
          continue;
        }
        if (operation == "stop") {
          respond(command, [&] { return framework->stop(); });
          continue;
        }
        if (busy.exchange(true)) throw std::runtime_error("MaaFramework worker is busy");
        try {
          if (active.joinable()) active.join();
          framework->prepare();
          active = std::thread([&, command] {
            respond(command, [&] { return framework->command(command); });
            busy = false;
          });
        } catch (...) {
          busy = false;
          throw;
        }
      } catch (const std::exception& error) {
        protocol.send(
            {{"type", "response"},
             {"id", command.is_object() ? command.value("id", Json(nullptr)) : Json(nullptr)},
             {"error", error.what()}});
      }
    }
  } catch (...) {
    if (active.joinable()) {
      try {
        framework->stop();
      } catch (...) {
      }
      active.join();
    }
    throw;
  }
  if (active.joinable()) {
    if (busy) {
      try {
        framework->stop();
      } catch (...) {
      }
    }
    active.join();
  }
  return 0;
}
}  // namespace maaverge
