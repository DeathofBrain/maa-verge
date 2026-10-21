#include "native.hpp"

#include <exception>
#include <memory>
#include <string_view>

int main(int argc, char** argv) {
  using namespace maaverge;
  try {
    Protocol protocol;
    std::string_view mode = "--worker";
    if (argc == 2) mode = argv[1];
    if (argc > 2 || (mode != "--worker" && mode != "--validate" && mode != "--lease-only")) {
      throw std::runtime_error("usage: maaverge-core-worker [--worker|--validate|--lease-only]");
    }
    std::string line;
    if (!read_message(line)) throw std::runtime_error("missing worker configuration");
    const auto config = Json::parse(line);
    check_protocol(config);
    if (mode == "--validate") {
      protocol.send(validate(config));
      return 0;
    }
    const auto lock_path = absolute_path(required_string(config, "lockPath"));
    DeviceLease lease(lock_path, duration_ms(config, "lockTimeoutMs", 10000, 60000));
    if (mode == "--lease-only") {
      protocol.send({{"type", "ready"}, {"mode", "lease-only"}});
      while (read_message(line)) {
        // Ownership is tied to the pipe lifetime. Lease mode cannot execute commands.
        throw std::runtime_error("lease-only mode accepts configuration followed by EOF only");
      }
      return 0;
    }
    std::unique_ptr<Core> core;
    {
      const int startup_timeout = duration_ms(config, "startupTimeoutMs", 45000);
      if (startup_timeout == 0) throw std::runtime_error("startupTimeoutMs must be positive");
      Deadline initialization("load and initialize", startup_timeout);
      core = std::make_unique<Core>(config, protocol);
    }
    protocol.send({{"type", "ready"}});
    core->begin_events();
    while (read_message(line)) {
      Json command = Json::object();
      try {
        command = Json::parse(line);
        if (!command.is_object()) throw std::runtime_error("command must be an object");
        if (!command.contains("id") || (!command["id"].is_string() && !command["id"].is_number_integer())) {
          throw std::runtime_error("command id must be a string or integer");
        }
        const auto result = core->command(command);
        protocol.send({{"type", "response"}, {"id", command["id"]}, {"result", result}});
      } catch (const std::exception& error) {
        protocol.send({{"type", "response"}, {"id", command.is_object() ? command.value("id", Json(nullptr)) : Json(nullptr)},
                       {"error", error.what()}});
      }
    }
    return 0;
  } catch (const std::exception& error) {
    std::fprintf(stderr, "maaverge-core-worker: %s\n", error.what());
    return 1;
  }
}
