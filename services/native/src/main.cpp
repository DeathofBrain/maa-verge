#include "native.hpp"
#include "framework.hpp"

#include <exception>
#include <string_view>

/** 原生入口只提供 MaaFramework 和跨实例租约；业务状态始终由宿主持有。 */
int main(int argc, char** argv) {
  using namespace maaverge;
  try {
    Protocol protocol;
    const std::string_view mode = argc == 2 ? argv[1] : "--framework-worker";
    if (argc > 2 ||
        (mode != "--lease-only" && mode != "--framework-worker" && mode != "--framework-validate"))
      throw std::runtime_error(
          "usage: maaverge-native-worker [--framework-worker|--framework-validate|--lease-only]");
    std::string line;
    if (!read_message(line)) throw std::runtime_error("missing worker configuration");
    const auto config = Json::parse(line);
    check_protocol(config);
    if (mode != "--lease-only")
      return framework_main(config, protocol, mode == "--framework-validate");

    // 租约探针没有 SDK 或 Controller，管道关闭后才释放稳定锁文件的 OS 锁。
    const auto lock_path = absolute_path(required_string(config, "lockPath"));
    DeviceLease lease(lock_path, duration_ms(config, "lockTimeoutMs", 10000, 60000));
    protocol.send({{"type", "ready"}, {"mode", "lease-only"}});
    while (read_message(line))
      throw std::runtime_error("lease-only mode accepts configuration followed by EOF only");
    return 0;
  } catch (const std::exception& error) {
    std::fprintf(stderr, "maaverge-native-worker: %s\n", error.what());
    return 1;
  }
}
