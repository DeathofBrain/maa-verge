#include "native.hpp"

#include <cerrno>
#include <cstdlib>
#include <cstring>
#include <iostream>
#include <stdexcept>
#include <system_error>
#ifdef _WIN32
#include <fcntl.h>
#include <io.h>
#include <windows.h>
#else
#include <dlfcn.h>
#include <fcntl.h>
#include <signal.h>
#include <sys/file.h>
#include <sys/stat.h>
#include <unistd.h>
#endif

namespace maaverge {
fs::path from_utf8(const std::string& text) {
  return fs::path(std::u8string(text.begin(), text.end()));
}

std::string to_utf8(const fs::path& path) {
  const auto text = path.u8string();
  return {text.begin(), text.end()};
}

fs::path absolute_path(const std::string& text) {
  auto result = fs::absolute(from_utf8(text)).lexically_normal();
#ifdef _WIN32
  auto native = result.native();
  if (!native.starts_with(L"\\\\?\\")) {
    native = native.starts_with(L"\\\\") ? L"\\\\?\\UNC\\" + native.substr(2) : L"\\\\?\\" + native;
    result = fs::path(native);
  }
#endif
  return result;
}

std::string required_string(const Json& value, const char* key) {
  if (!value.is_object() || !value.contains(key) || !value[key].is_string()) {
    throw std::runtime_error(std::string("missing string: ") + key);
  }
  auto text = value[key].get<std::string>();
  if (text.empty() || text.find('\0') != std::string::npos) {
    throw std::runtime_error(std::string("invalid string: ") + key);
  }
  return text;
}

void check_protocol(const Json& value) {
  if (!value.is_object()) throw std::runtime_error("protocol message must be an object");
  if (value.contains("protocolVersion") &&
      (!value["protocolVersion"].is_number_integer() || value["protocolVersion"] != protocol_version)) {
    throw std::runtime_error("unsupported protocolVersion; expected 1");
  }
}

int duration_ms(const Json& value, const char* key, int fallback, int maximum) {
  if (!value.contains(key)) return fallback;
  if (!value[key].is_number_integer()) throw std::runtime_error(std::string("invalid timeout: ") + key);
  const auto duration = value[key].get<std::int64_t>();
  if (duration < 0 || duration > maximum) throw std::runtime_error(std::string("invalid timeout: ") + key);
  return static_cast<int>(duration);
}

bool read_message(std::string& line) {
  line.clear();
  char character = 0;
  while (std::cin.get(character)) {
    if (character == '\n') break;
    if (line.size() == max_message_bytes) throw std::runtime_error("protocol message exceeds 4 MiB");
    line.push_back(character);
  }
  if (!line.empty() && line.back() == '\r') line.pop_back();
  return !line.empty() || !std::cin.eof();
}

Protocol::Protocol() {
  std::fflush(stdout);
#ifdef _WIN32
  const int descriptor = _dup(_fileno(stdout));
  if (descriptor < 0) throw std::runtime_error("cannot duplicate protocol stdout");
  if (!SetHandleInformation(reinterpret_cast<HANDLE>(_get_osfhandle(descriptor)), HANDLE_FLAG_INHERIT, 0)) {
    _close(descriptor);
    throw std::runtime_error("cannot protect protocol descriptor from native child processes");
  }
  stream_ = _fdopen(descriptor, "wb");
  if (!stream_) { _close(descriptor); throw std::runtime_error("cannot open protocol stdout"); }
  _setmode(_fileno(stdin), _O_BINARY);
  if (_dup2(_fileno(stderr), _fileno(stdout)) != 0 ||
      !SetStdHandle(STD_OUTPUT_HANDLE, GetStdHandle(STD_ERROR_HANDLE))) {
    std::fclose(stream_);
    stream_ = nullptr;
    throw std::runtime_error("cannot redirect native stdout");
  }
#else
  signal(SIGPIPE, SIG_IGN);
  const int descriptor = dup(fileno(stdout));
  if (descriptor < 0) throw std::runtime_error("cannot duplicate protocol stdout");
  fcntl(descriptor, F_SETFD, FD_CLOEXEC);
  stream_ = fdopen(descriptor, "w");
  if (!stream_) { ::close(descriptor); throw std::runtime_error("cannot open protocol stdout"); }
  if (dup2(fileno(stderr), fileno(stdout)) < 0) {
    std::fclose(stream_);
    stream_ = nullptr;
    throw std::runtime_error("cannot redirect native stdout");
  }
#endif
}

Protocol::~Protocol() { if (stream_) std::fclose(stream_); }

void Protocol::send(Json value) {
  value["protocolVersion"] = protocol_version;
  const auto text = value.dump(-1, ' ', true, Json::error_handler_t::replace) + "\n";
  if (text.size() > max_message_bytes) throw std::runtime_error("protocol output exceeds 4 MiB");
  std::lock_guard guard(mutex_);
  if (std::fwrite(text.data(), 1, text.size(), stream_) != text.size() || std::fflush(stream_) != 0) {
    std::fprintf(stderr, "protocol output closed; isolated worker exiting\n");
    std::_Exit(74);
  }
}

Deadline::Deadline(std::string operation, int timeout_ms)
    : thread_([this, operation = std::move(operation), timeout_ms] {
        std::unique_lock guard(mutex_);
        if (!condition_.wait_for(guard, std::chrono::milliseconds(timeout_ms), [this] { return done_; })) {
          std::fprintf(stderr, "native timeout in %s; result unknown, do not replay\n", operation.c_str());
          std::fflush(stderr);
          std::_Exit(124);
        }
      }) {}

Deadline::~Deadline() {
  { std::lock_guard guard(mutex_); done_ = true; }
  condition_.notify_one();
  thread_.join();
}

DeviceLease::DeviceLease(const fs::path& path, int timeout_ms) {
  fs::create_directories(path.parent_path());
  const auto deadline = std::chrono::steady_clock::now() + std::chrono::milliseconds(timeout_ms);
  while (true) {
#ifdef _WIN32
    HANDLE handle = CreateFileW(path.c_str(), GENERIC_READ | GENERIC_WRITE,
                                FILE_SHARE_READ | FILE_SHARE_WRITE, nullptr, OPEN_ALWAYS,
                                FILE_ATTRIBUTE_NORMAL | FILE_FLAG_OPEN_REPARSE_POINT, nullptr);
    if (handle != INVALID_HANDLE_VALUE) {
      BY_HANDLE_FILE_INFORMATION information{};
      if (!GetFileInformationByHandle(handle, &information) ||
          (information.dwFileAttributes & (FILE_ATTRIBUTE_REPARSE_POINT | FILE_ATTRIBUTE_DIRECTORY))) {
        CloseHandle(handle);
        throw std::runtime_error("device lease must be a regular file");
      }
      OVERLAPPED overlapped{};
      if (LockFileEx(handle, LOCKFILE_EXCLUSIVE_LOCK | LOCKFILE_FAIL_IMMEDIATELY, 0, 1, 0, &overlapped)) {
        handle_ = handle;
        return;
      }
      const auto error = GetLastError();
      CloseHandle(handle);
      if (error != ERROR_LOCK_VIOLATION && error != ERROR_SHARING_VIOLATION) {
        throw std::system_error(static_cast<int>(error), std::system_category(), "device lock failed");
      }
    } else {
      const auto error = GetLastError();
      if (error != ERROR_SHARING_VIOLATION && error != ERROR_ACCESS_DENIED && error != ERROR_DELETE_PENDING) {
        throw std::system_error(static_cast<int>(error), std::system_category(), "device lock open failed");
      }
    }
#else
    int flags = O_RDWR | O_CREAT | O_CLOEXEC;
#ifdef O_NOFOLLOW
    flags |= O_NOFOLLOW;
#endif
    const int descriptor = open(path.c_str(), flags, 0600);
    if (descriptor < 0) throw std::system_error(errno, std::generic_category(), "device lock open failed");
    struct stat information{};
    if (fstat(descriptor, &information) != 0 || !S_ISREG(information.st_mode)) {
      ::close(descriptor);
      throw std::runtime_error("device lease must be a regular file");
    }
    if (flock(descriptor, LOCK_EX | LOCK_NB) == 0) { descriptor_ = descriptor; return; }
    const int error = errno;
    ::close(descriptor);
    if (error != EAGAIN && error != EWOULDBLOCK && error != EACCES) {
      throw std::system_error(error, std::generic_category(), "device lock failed (no soft fallback)");
    }
#endif
    if (std::chrono::steady_clock::now() >= deadline) throw std::runtime_error("device lock busy or unavailable");
    std::this_thread::sleep_for(std::chrono::milliseconds(10));
  }
}

DeviceLease::~DeviceLease() {
  // Keep the pathname stable: unlinking a Unix lock splits contenders over inodes.
#ifdef _WIN32
  if (handle_) {
    OVERLAPPED overlapped{};
    UnlockFileEx(handle_, 0, 1, 0, &overlapped);
    CloseHandle(handle_);
  }
#else
  if (descriptor_ >= 0) { flock(descriptor_, LOCK_UN); ::close(descriptor_); }
#endif
}

Api::Api(const fs::path& core) {
#ifdef _WIN32
  const auto path = core / L"MaaCore.dll";
#elif defined(__APPLE__)
  const auto path = core / "libMaaCore.dylib";
#else
  const auto path = core / "libMaaCore.so";
#endif
  if (!fs::is_regular_file(path)) throw std::runtime_error("missing MaaCore library: " + to_utf8(path));
  try {
#ifdef _WIN32
    directory_cookie_ = AddDllDirectory(core.c_str());
    if (!directory_cookie_) throw std::runtime_error("cannot add MaaCore dependency directory");
    library_ = LoadLibraryExW(path.c_str(), nullptr, LOAD_LIBRARY_SEARCH_DLL_LOAD_DIR | LOAD_LIBRARY_SEARCH_DEFAULT_DIRS);
    if (!library_) throw std::system_error(static_cast<int>(GetLastError()), std::system_category(), "MaaCore load failed");
#else
    library_ = dlopen(path.c_str(), RTLD_NOW | RTLD_LOCAL);
    if (!library_) throw std::runtime_error(std::string("MaaCore load failed: ") + dlerror());
#endif
#define LOAD(member, name) member = reinterpret_cast<decltype(member)>(symbol(name))
    LOAD(version, "AsstGetVersion");
    LOAD(set_user_dir, "AsstSetUserDir");
    LOAD(load_resource, "AsstLoadResource");
    LOAD(create, "AsstCreate");
    LOAD(create_ex, "AsstCreateEx");
    LOAD(destroy, "AsstDestroy");
    LOAD(connect, "AsstAsyncConnect");
    LOAD(append, "AsstAppendTask");
    LOAD(start, "AsstStart");
    LOAD(stop, "AsstStop");
    LOAD(running, "AsstRunning");
    // Older reference and synthetic cores can still use the default ADB path.
    set_connection_extras = reinterpret_cast<decltype(set_connection_extras)>(symbol("AsstSetConnectionExtras", false));
    set_instance_option = reinterpret_cast<decltype(set_instance_option)>(symbol("AsstSetInstanceOption", false));
    screencap = reinterpret_cast<decltype(screencap)>(symbol("AsstAsyncScreencap", false));
    get_image = reinterpret_cast<decltype(get_image)>(symbol("AsstGetImage", false));
    click = reinterpret_cast<decltype(click)>(symbol("AsstAsyncClick", false));
#undef LOAD
  } catch (...) { unload(); throw; }
}

void* Api::symbol(const char* name, bool required) {
#ifdef _WIN32
  auto address = reinterpret_cast<void*>(GetProcAddress(static_cast<HMODULE>(library_), name));
#else
  auto address = dlsym(library_, name);
#endif
  if (!address && required) throw std::runtime_error(std::string("missing MaaCore C API symbol: ") + name);
  return address;
}

void Api::unload() noexcept {
#ifdef _WIN32
  if (library_) FreeLibrary(static_cast<HMODULE>(library_));
  if (directory_cookie_) RemoveDllDirectory(directory_cookie_);
  directory_cookie_ = nullptr;
#else
  if (library_) dlclose(library_);
#endif
  library_ = nullptr;
}
Api::~Api() {
  try {
    Deadline deadline("unload library", 5000);
    unload();
  } catch (...) {
    std::fprintf(stderr, "native library unload failed; isolated worker exiting\n");
    std::fflush(stderr);
    std::_Exit(70);
  }
}
}  // namespace maaverge
