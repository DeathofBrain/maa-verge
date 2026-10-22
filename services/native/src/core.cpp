#include "native.hpp"

#include <algorithm>
#include <atomic>
#include <cstdlib>
#include <fstream>
#include <random>
#include <stdexcept>
#include <vector>

namespace maaverge {
namespace {
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
      connection_extras_ = {{"path", to_utf8(emulator_path)}, {"index", capture["instanceIndex"]}};
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
    std::lock_guard guard(self.event_mutex_);
    self.events_.push({{"type", "callback"}, {"message", message}, {"details", std::move(payload)}});
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

void Core::capture_failed(const std::string& error) {
  capture_verified_ = false;
  capture_error_ = error;
  std::fprintf(stderr, "required screenshot protocol failed: %s\n", error.c_str());
  if (!connected_) return;
  connected_ = false;
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
