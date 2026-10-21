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
  if (operation == "connect") {
    const auto adb = required_string(config_, "adb");
    const auto address = required_string(config_, "address");
    const int id = api_.connect(handle_, adb.c_str(), address.c_str(), "General", false);
    if (id <= 0) throw std::runtime_error("MaaCore rejected async device connection");
    pending_[id] = std::chrono::steady_clock::now();
    return {{"asyncId", id}};
  }
  if (operation == "task") {
    if (!pending_.empty() || api_.running(handle_)) throw std::runtime_error("core or asynchronous calls are not idle");
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
  throw std::runtime_error("unknown core worker operation");
}

void Core::pump() {
  try {
    std::unique_lock guard(mutex_);
    while (!stop_condition_.wait_for(guard, std::chrono::milliseconds(100), [this] { return stopping_; })) {
      Deadline deadline("event status", call_timeout_ms_);
      std::queue<Json> events;
      { std::lock_guard event_guard(event_mutex_); events.swap(events_); }
      while (!events.empty()) {
        auto event = std::move(events.front());
        events.pop();
        if (event["message"] == 4) {
          const auto& details = event["details"];
          if (details.contains("async_call_id") && details["async_call_id"].is_number_integer()) {
            pending_.erase(details["async_call_id"].get<int>());
          }
        }
        protocol_.send(std::move(event));
      }
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
