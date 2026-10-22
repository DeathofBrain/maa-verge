#include "native.hpp"

#include <algorithm>
#include <atomic>
#include <cstdlib>
#include <cstring>
#include <fstream>
#include <random>
#include <stdexcept>
#include <vector>

namespace maaverge {
namespace {
// Base64 plus the response envelope must fit the 4 MiB NDJSON transport.
constexpr std::size_t max_preview_bytes = 3 * 1024 * 1024 - 8192;

std::string base64(const unsigned char* data, std::size_t size) {
  constexpr char alphabet[] = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  std::string result;
  result.reserve(((size + 2) / 3) * 4);
  for (std::size_t index = 0; index < size; index += 3) {
    const auto remaining = size - index;
    const unsigned int bits = (static_cast<unsigned int>(data[index]) << 16) |
                              (remaining > 1 ? static_cast<unsigned int>(data[index + 1]) << 8 : 0) |
                              (remaining > 2 ? static_cast<unsigned int>(data[index + 2]) : 0);
    result.push_back(alphabet[(bits >> 18) & 63]);
    result.push_back(alphabet[(bits >> 12) & 63]);
    result.push_back(remaining > 1 ? alphabet[(bits >> 6) & 63] : '=');
    result.push_back(remaining > 2 ? alphabet[bits & 63] : '=');
  }
  return result;
}

std::uint32_t big_endian_u32(const unsigned char* data) {
  return (static_cast<std::uint32_t>(data[0]) << 24) |
         (static_cast<std::uint32_t>(data[1]) << 16) |
         (static_cast<std::uint32_t>(data[2]) << 8) |
         static_cast<std::uint32_t>(data[3]);
}

class ProbeDirectory final {
 public:
  ProbeDirectory() {
    std::random_device random;
    for (int attempt = 0; attempt < 32; ++attempt) {
      path = fs::temp_directory_path() / ("maaverge-core-probe-" + std::to_string(random()));
      std::error_code error;
      if (fs::create_directory(path, error)) return;
      if (error && error != std::errc::file_exists) throw fs::filesystem_error("probe directory", path, error);
    }
    throw std::runtime_error("cannot create isolated probe directory");
  }
  ~ProbeDirectory() { std::error_code ignored; fs::remove_all(path, ignored); }
  fs::path path;
};

std::string probe_errors(const fs::path& user) {
  std::ifstream input(user / "debug" / "asst.log", std::ios::binary);
  if (!input) return {};
  input.seekg(0, std::ios::end);
  const auto size = input.tellg();
  input.seekg(std::max<std::streamoff>(0, static_cast<std::streamoff>(size) - 65536));
  std::vector<std::string> errors;
  for (std::string line; std::getline(input, line);) {
    if (!line.empty() && line.back() == '\r') line.pop_back();
    if (line.find("[ERR]") != std::string::npos) errors.push_back(line);
  }
  std::string result;
  const auto first = errors.size() > 8 ? errors.size() - 8 : 0;
  for (auto index = first; index < errors.size(); ++index) {
    if (!result.empty()) result += '\n';
    result += errors[index];
  }
  if (result.size() > 1200) result.erase(0, result.size() - 1200);
  return result;
}

int positive_duration(const Json& config, const char* key, int fallback) {
  const int value = duration_ms(config, key, fallback);
  if (value == 0) throw std::runtime_error(std::string("timeout must be positive: ") + key);
  return value;
}
}  // namespace

Json validate(const Json& config) {
  const auto core = absolute_path(required_string(config, "core"));
  const auto resource = absolute_path(required_string(config, "resource"));
  const auto expected = required_string(config, "version");
  if (!fs::is_regular_file(resource / "resource" / "version.json")) {
    throw std::runtime_error("resource snapshot missing resource/version.json");
  }
  Deadline deadline("validate", positive_duration(config, "nativeCallTimeoutMs", 90000));
  ProbeDirectory user;
  // Destroy the library before removing the probe directory (native logs may be open).
  Api api(core);
  const char* raw_version = api.version();
  if (!raw_version) throw std::runtime_error("MaaCore returned a null version");
  const std::string actual(raw_version);
  if (actual != expected) throw std::runtime_error("MaaCore version mismatch: expected " + expected + ", got " + actual);
  const auto user_text = to_utf8(user.path);
  if (!api.set_user_dir(user_text.c_str())) throw std::runtime_error("cannot set isolated core user directory");
  const auto resource_text = to_utf8(resource);
  if (!api.load_resource(resource_text.c_str())) {
    throw std::runtime_error("MaaCore resource validation failed\n" + probe_errors(user.path));
  }
  return {{"version", actual}, {"resourceLoaded", true}};
}

Core::Core(const Json& config, Protocol& protocol)
    : config_(config), protocol_(protocol), api_(absolute_path(required_string(config, "core"))),
      call_timeout_ms_(positive_duration(config, "nativeCallTimeoutMs", 20000)),
      async_timeout_ms_(positive_duration(config, "asyncTimeoutMs", 30000)),
      shutdown_timeout_ms_(positive_duration(config, "shutdownTimeoutMs", 5000)) {
  Deadline deadline("initialize", call_timeout_ms_);
  const auto user = absolute_path(required_string(config, "userDir"));
  fs::create_directories(user);
  const auto user_text = to_utf8(user);
  if (!api_.set_user_dir(user_text.c_str())) throw std::runtime_error("cannot set core user directory");
  const auto resource = to_utf8(absolute_path(required_string(config, "resource")));
  if (!api_.load_resource(resource.c_str())) throw std::runtime_error("cannot load resource snapshot");
  required_string(config, "adb");
  required_string(config, "address");
  if (config.contains("capture")) {
    const auto& capture = config["capture"];
    const auto method = required_string(capture, "method");
    if (method != "adb" && method != "mumu" && method != "ldplayer") {
      throw std::runtime_error("unsupported capture method");
    }
    if (method != "adb") {
      if (!api_.set_connection_extras) throw std::runtime_error("missing MaaCore C API symbol: AsstSetConnectionExtras");
      const auto emulator_path = absolute_path(required_string(capture, "emulatorPath"));
      if (!fs::is_directory(emulator_path)) throw std::runtime_error("capture emulatorPath must be an existing directory");
      if (!capture.contains("instanceIndex") || !capture["instanceIndex"].is_number_integer() ||
          capture["instanceIndex"] < 0 || capture["instanceIndex"] > 2147483647) {
        throw std::runtime_error("capture instanceIndex must be a nonnegative 32-bit integer");
      }
      connection_config_ = method == "mumu" ? "MuMuEmulator12" : "LDPlayer";
      expected_capture_method_ = method == "mumu" ? "MumuExtras" : "LDExtras";
      // Emulator SDKs parse this path themselves and reject Win32 extended-path
      // prefixes even though LoadLibraryW accepts them. Keep native file checks
      // above long-path aware, and pass a conventional absolute path to the SDK.
      auto sdk_path = to_utf8(emulator_path);
#ifdef _WIN32
      if (sdk_path.starts_with("\\\\?\\UNC\\")) sdk_path = "\\\\" + sdk_path.substr(8);
      else if (sdk_path.starts_with("\\\\?\\")) sdk_path.erase(0, 4);
#endif
      connection_extras_ = {{"path", sdk_path}, {"index", capture["instanceIndex"]}};
      if (method == "mumu") connection_extras_["touch"] = false;
      if (capture.contains("pid")) {
        if (method != "ldplayer" || !capture["pid"].is_number_integer() ||
            capture["pid"] <= 0 || capture["pid"] > 2147483647) {
          throw std::runtime_error("capture pid must be a positive 32-bit LDPlayer process id");
        }
        connection_extras_["pid"] = capture["pid"];
      }
    }
  }
  handle_ = api_.create_ex(&Core::callback, this);
  if (!handle_) throw std::runtime_error("cannot create MaaCore instance");
}

Core::~Core() { close(); }

void Core::begin_events() { pump_ = std::thread([this] { pump(); }); }

void Core::callback(int message, const char* details, void* context) noexcept {
  auto& self = *static_cast<Core*>(context);
  try {
    Json payload = Json::object();
    if (details) {
      std::size_t length = 0;
      while (length <= max_message_bytes && details[length] != '\0') ++length;
      if (length > max_message_bytes) {
        payload = {{"decodeError", true}};
      } else {
        // Copy borrowed native memory while the callback is active.
        const std::string copy(details, length);
        payload = Json::parse(copy, nullptr, false);
        if (!payload.is_object()) payload = {{"decodeError", true}};
      }
    }
    {
      std::lock_guard guard(self.event_mutex_);
      self.events_.push({{"type", "callback"}, {"message", message}, {"details", std::move(payload)}});
    }
    self.event_condition_.notify_one();
  } catch (...) {
    std::fprintf(stderr, "native callback could not be copied\n");
  }
}

Json Core::command(const Json& value) {
  check_protocol(value);
  std::lock_guard guard(mutex_);
  Deadline deadline("command", call_timeout_ms_);
  const auto operation = required_string(value, "operation");
  drain_events();
  if (operation == "connect") {
    if (!pending_.empty() || api_.running(handle_)) throw std::runtime_error("core or asynchronous calls are not idle");
    connected_ = false;
    frame_width_ = frame_height_ = 0;
    capture_verified_ = false;
    observed_capture_method_.clear();
    capture_error_.clear();
    if (!expected_capture_method_.empty()) {
      const auto extras = connection_extras_.dump(-1, ' ', true);
      api_.set_connection_extras(connection_config_.c_str(), extras.c_str());
      std::fprintf(stderr, "required screenshot protocol: %s (connection %s)\n",
                   expected_capture_method_.c_str(), connection_config_.c_str());
    }
    const auto adb = required_string(config_, "adb");
    const auto address = required_string(config_, "address");
    const int id = api_.connect(handle_, adb.c_str(), address.c_str(), connection_config_.c_str(), false);
    if (id <= 0) throw std::runtime_error("MaaCore rejected async device connection");
    pending_[id] = std::chrono::steady_clock::now();
    return {{"asyncId", id}};
  }
  if (operation == "task") {
    if (!pending_.empty() || api_.running(handle_)) throw std::runtime_error("core or asynchronous calls are not idle");
    if (!expected_capture_method_.empty() && (!connected_ || !capture_verified_ || !capture_error_.empty())) {
      throw std::runtime_error("required screenshot protocol has not been verified; task execution is blocked" +
                               (capture_error_.empty() ? std::string() : ": " + capture_error_));
    }
    const auto& task = value.at("task");
    const auto type = required_string(task, "type");
    if (!task.contains("params") || !task["params"].is_object()) throw std::runtime_error("task params must be an object");
    const auto params = task["params"].dump(-1, ' ', true);
    const int id = api_.append(handle_, type.c_str(), params.c_str());
    if (id <= 0) throw std::runtime_error("MaaCore rejected appended task");
    if (!api_.start(handle_)) {
      api_.stop(handle_);  // AsstStop clears the queue; this is never pause/resume.
      throw std::runtime_error("MaaCore rejected task start");
    }
    return {{"taskId", id}};
  }
  if (operation == "stop") {
    if (!api_.stop(handle_)) throw std::runtime_error("MaaCore rejected stop");
    return {{"stopping", true}};
  }
  if (operation == "frame") return frame();
  if (operation == "click") {
    if (!api_.click) throw std::runtime_error("missing MaaCore C API symbol: AsstAsyncClick");
    if (!connected_ || (!expected_capture_method_.empty() && (!capture_verified_ || !capture_error_.empty()))) {
      throw std::runtime_error("device and required screenshot protocol must be connected before click");
    }
    if (!pending_.empty() || api_.running(handle_)) throw std::runtime_error("core or asynchronous calls are not idle");
    if (frame_width_ == 0 || frame_height_ == 0) throw std::runtime_error("a preview frame is required before click");
    for (const char* coordinate : {"x", "y"}) {
      if (!value.contains(coordinate) || !value[coordinate].is_number_integer() ||
          value[coordinate] < 0 || value[coordinate] >= (coordinate[0] == 'x' ? frame_width_ : frame_height_)) {
        throw std::runtime_error("click coordinates must be integers inside the preview frame");
      }
    }
    // AsstGetImage returns the resized preview, and AsstAsyncClick goes through
    // the same MaaCore scale proxy. These are preview pixels, not physical pixels.
    const int id = api_.click(handle_, value["x"].get<std::int32_t>(), value["y"].get<std::int32_t>(), true);
    await_async_result(id, "Click");
    if (!connected_) throw std::runtime_error("device disconnected during click; result unknown, do not replay");
    return {{"accepted", true}};
  }
  if (operation == "screencap") {
    if (!api_.screencap) throw std::runtime_error("missing MaaCore C API symbol: AsstAsyncScreencap");
    if (!pending_.empty() || api_.running(handle_)) throw std::runtime_error("core or asynchronous calls are not idle");
    if (!connected_ || (!expected_capture_method_.empty() && (!capture_verified_ || !capture_error_.empty()))) {
      throw std::runtime_error("device and required screenshot protocol must be connected before screencap");
    }
    const int id = api_.screencap(handle_, false);
    if (id <= 0) throw std::runtime_error("MaaCore rejected async screencap");
    pending_[id] = std::chrono::steady_clock::now();
    return {{"asyncId", id}};
  }
  throw std::runtime_error("unknown core worker operation");
}

void Core::await_async_result(int id, const char* what) {
  if (id <= 0) throw std::runtime_error(std::string("MaaCore rejected async ") + what);
  awaiting_async_id_ = id;
  awaited_async_result_.reset();
  const auto deadline = std::chrono::steady_clock::now() + std::chrono::milliseconds(async_timeout_ms_);
  // Upstream block=true returns after the native operation, before its message
  // thread necessarily delivers AsyncCallInfo. Wait for that callback directly;
  // the pump cannot acquire mutex_ while this command is in progress.
  for (;;) {
    drain_events();
    if (awaited_async_result_) break;
    std::unique_lock guard(event_mutex_);
    if (!event_condition_.wait_until(guard, deadline, [this] { return !events_.empty(); })) {
      std::fprintf(stderr, "native async timeout in %s; result unknown, do not replay\n", what);
      std::fflush(stderr);
      std::_Exit(124);
    }
  }
  auto result = std::move(*awaited_async_result_);
  awaited_async_result_.reset();
  awaiting_async_id_ = 0;
  const auto details = result.value("details", Json::object());
  if (!result.contains("what") || result["what"] != what || !details.is_object() ||
      !details.contains("ret") || !details["ret"].is_boolean() || !details["ret"].get<bool>()) {
    throw std::runtime_error(std::string("MaaCore async ") + what + " was not confirmed successful; do not replay");
  }
}

Json Core::frame() {
  if (!api_.get_image) throw std::runtime_error("missing MaaCore C API symbol: AsstGetImage");
  if (!connected_ || (!expected_capture_method_.empty() && (!capture_verified_ || !capture_error_.empty()))) {
    throw std::runtime_error("device and required screenshot protocol must be connected before frame");
  }
  if (!pending_.empty()) throw std::runtime_error("core asynchronous calls are not idle");
  const bool running = api_.running(handle_);
  if (!running) {
    if (!api_.screencap) throw std::runtime_error("missing MaaCore C API symbol: AsstAsyncScreencap");
    frame_width_ = frame_height_ = 0;
    await_async_result(api_.screencap(handle_, true), "Screencap");
  }
  if (!connected_ || (!expected_capture_method_.empty() && (!capture_verified_ || !capture_error_.empty()))) {
    throw std::runtime_error("device or required screenshot protocol disconnected during frame");
  }
  image_buffer_.resize(max_preview_bytes);
  // AsstSize is uint64_t; upstream returns UINT64_MAX (AsstGetNullSize) when
  // empty or too large, rather than a required allocation size. Never resize
  // from that sentinel or retry an action to obtain the image.
  const auto size = api_.get_image(handle_, image_buffer_.data(), image_buffer_.size());
  if (size < 33 || size > image_buffer_.size()) {
    frame_width_ = frame_height_ = 0;
    throw std::runtime_error("MaaCore preview image is empty, exceeds the PNG limit or is unavailable");
  }
  const auto* data = image_buffer_.data();
  constexpr unsigned char signature[] = {137, 80, 78, 71, 13, 10, 26, 10};
  const auto width = big_endian_u32(data + 16);
  const auto height = big_endian_u32(data + 20);
  if (std::memcmp(data, signature, sizeof(signature)) != 0 || big_endian_u32(data + 8) != 13 ||
      std::memcmp(data + 12, "IHDR", 4) != 0 || width == 0 || height == 0 ||
      width > 8192 || height > 8192 || static_cast<std::uint64_t>(width) * height > 16 * 1024 * 1024) {
    frame_width_ = frame_height_ = 0;
    throw std::runtime_error("MaaCore preview must be a PNG with bounded IHDR dimensions");
  }
  frame_width_ = static_cast<int>(width);
  frame_height_ = static_cast<int>(height);
  return {{"width", width}, {"height", height}, {"mimeType", "image/png"},
          {"data", base64(data, static_cast<std::size_t>(size))},
          {"canControl", !running && api_.click != nullptr}};
}

void Core::capture_failed(const std::string& error) {
  capture_verified_ = false;
  capture_error_ = error;
  std::fprintf(stderr, "required screenshot protocol failed: %s\n", error.c_str());
  if (!connected_) return;
  connected_ = false;
  frame_width_ = frame_height_ = 0;
  // A later reprobe must never silently switch a running plan to ADB capture.
  if (!api_.stop(handle_)) throw std::runtime_error("MaaCore rejected stop after screenshot protocol failure");
  protocol_.send({{"type", "callback"}, {"message", 2},
                 {"details", {{"what", "Disconnect"}, {"why", "RequiredCaptureProtocolUnavailable"},
                              {"details", {{"error", error}, {"expectedMethod", expected_capture_method_},
                                           {"actualMethod", observed_capture_method_}}}}}});
}

void Core::drain_events() {
  std::queue<Json> events;
  { std::lock_guard event_guard(event_mutex_); events.swap(events_); }
  while (!events.empty()) {
    auto event = std::move(events.front());
    events.pop();
    auto& details = event["details"];
    const auto what = details.contains("what") && details["what"].is_string()
                          ? details["what"].get<std::string>() : std::string();
    if (event["message"] == 2 && !expected_capture_method_.empty()) {
      if (what == "FastestWayToScreencap") {
        const auto result = details.value("details", Json::object());
        observed_capture_method_ = result.is_object() && result.contains("method") && result["method"].is_string()
                                       ? result["method"].get<std::string>() : std::string();
        if (observed_capture_method_ == expected_capture_method_ && capture_error_.empty()) {
          capture_verified_ = true;
          std::fprintf(stderr, "verified screenshot protocol: %s\n", observed_capture_method_.c_str());
        } else {
          capture_failed("expected " + expected_capture_method_ + ", selected " +
                         (observed_capture_method_.empty() ? "unknown" : observed_capture_method_));
        }
      } else if (what == "ScreencapFailed") {
        capture_failed("MaaCore reported ScreencapFailed for " + expected_capture_method_);
      }
    }
    if (event["message"] == 2 && (what == "Disconnect" || what == "ResolutionChanged")) {
      connected_ = false;
      frame_width_ = frame_height_ = 0;
      capture_verified_ = false;
    }
    if (event["message"] == 4) {
      if (details.contains("async_call_id") && details["async_call_id"].is_number_integer()) {
        pending_.erase(details["async_call_id"].get<int>());
      }
      if (what == "Connect") {
        auto result = details.value("details", Json::object());
        const bool success = result.is_object() && result.contains("ret") &&
                             result["ret"].is_boolean() && result["ret"].get<bool>();
        if (!expected_capture_method_.empty() && (!success || !capture_verified_ || !capture_error_.empty())) {
          if (!result.is_object()) result = Json::object();
          if (capture_error_.empty()) capture_failed(success ? "connection did not verify the required screenshot protocol"
                                                             : "MaaCore device connection failed");
          result["ret"] = false;
          result["error"] = capture_error_;
          result["expectedMethod"] = expected_capture_method_;
          result["actualMethod"] = observed_capture_method_;
          details["details"] = std::move(result);
          connected_ = false;
        } else {
          connected_ = success;
        }
      } else if (what == "Screencap" && !expected_capture_method_.empty()) {
        auto result = details.value("details", Json::object());
        const bool success = result.is_object() && result.contains("ret") &&
                             result["ret"].is_boolean() && result["ret"].get<bool>();
        if (!success || !capture_verified_ || !capture_error_.empty()) {
          if (capture_error_.empty()) capture_failed("MaaCore async screencap failed for " + expected_capture_method_);
          if (!result.is_object()) result = Json::object();
          result["ret"] = false;
          result["error"] = capture_error_;
          details["details"] = std::move(result);
        }
      }
      if (awaiting_async_id_ != 0 && details.contains("async_call_id") &&
          details["async_call_id"].is_number_integer() && details["async_call_id"] == awaiting_async_id_) {
        awaited_async_result_ = details;
      }
    }
    protocol_.send(std::move(event));
  }
}

void Core::pump() {
  try {
    std::unique_lock guard(mutex_);
    while (!stop_condition_.wait_for(guard, std::chrono::milliseconds(100), [this] { return stopping_; })) {
      Deadline deadline("event status", call_timeout_ms_);
      drain_events();
      std::vector<int> pending;
      for (const auto& [id, started] : pending_) {
        if (std::chrono::steady_clock::now() - started > std::chrono::milliseconds(async_timeout_ms_)) {
          std::fprintf(stderr, "native async timeout; result unknown, do not replay\n");
          std::fflush(stderr);
          std::_Exit(124);
        }
        pending.push_back(id);
      }
      protocol_.send({{"type", "status"}, {"running", api_.running(handle_)}, {"pendingAsync", pending}});
    }
  } catch (const std::exception& error) {
    std::fprintf(stderr, "native event pump failed: %s; result unknown\n", error.what());
    std::fflush(stderr);
    std::_Exit(70);
  }
}

void Core::close() noexcept {
  if (!handle_) return;
  try {
    Deadline deadline("destroy", shutdown_timeout_ms_);
    { std::lock_guard guard(mutex_); stopping_ = true; }
    stop_condition_.notify_all();
    if (pump_.joinable()) pump_.join();
    std::lock_guard guard(mutex_);
    api_.stop(handle_);
    // `this`, the callback queue and the library outlive AsstDestroy, including
    // callbacks from its teardown. Never detach threads that still use native memory.
    api_.destroy(handle_);
    handle_ = nullptr;
  } catch (const std::exception& error) {
    std::fprintf(stderr, "native teardown failed: %s; isolated worker exiting\n", error.what());
    std::fflush(stderr);
    std::_Exit(70);
  }
}
}  // namespace maaverge
